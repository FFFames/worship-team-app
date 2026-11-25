// Finds NDI sources and passes decoded, straight-alpha video frames to Electron.
#include "ndi-runtime.hpp"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstring>
#include <thread>
#include <vector>

namespace {

using namespace worship_ndi;
using Clock = std::chrono::steady_clock;
std::atomic<bool> parentClosed = false;

struct Library {
  decltype(&NDIlib_find_create_v2) findCreate;
  decltype(&NDIlib_find_destroy) findDestroy;
  decltype(&NDIlib_find_wait_for_sources) wait;
  decltype(&NDIlib_find_get_current_sources) sources;
  decltype(&NDIlib_recv_create_v3) recvCreate;
  decltype(&NDIlib_recv_destroy) recvDestroy;
  decltype(&NDIlib_recv_capture_v3) capture;
  decltype(&NDIlib_recv_free_video_v2) freeVideo;
  decltype(&NDIlib_recv_free_audio_v3) freeAudio;
};

void writeNumber(uint8_t* bytes, uint32_t value) {
  for (int i = 0; i < 4; i++) bytes[i] = static_cast<uint8_t>(value >> (i * 8));
}

bool validFrame(const NDIlib_video_frame_v2_t& frame) {
  return frame.p_data && frame.xres > 0 && frame.yres > 0
    && frame.xres <= 4096 && frame.yres <= 4096 && frame.xres * frame.yres <= 4096 * 2160
    && frame.line_stride_in_bytes >= frame.xres * 4
    && (frame.FourCC == NDIlib_FourCC_video_type_RGBA || frame.FourCC == NDIlib_FourCC_video_type_RGBX);
}

bool writeFrame(const NDIlib_video_frame_v2_t& frame, std::vector<uint8_t>& rgba) {
  const size_t stride = static_cast<size_t>(frame.xres) * 4;
  const bool opaque = frame.FourCC == NDIlib_FourCC_video_type_RGBX;
  rgba.resize(stride * frame.yres);
  for (int y = 0; y < frame.yres; y++) {
    auto row = rgba.data() + stride * y;
    std::memcpy(row, frame.p_data + static_cast<size_t>(frame.line_stride_in_bytes) * y, stride);
    if (opaque) {
      for (size_t alpha = 3; alpha < stride; alpha += 4) row[alpha] = 255;
    }
  }
  const float aspect = frame.picture_aspect_ratio;
  const float displayAspect = std::isfinite(aspect) && aspect > 0.0f && aspect <= 100.0f
    ? aspect : static_cast<float>(frame.xres) / frame.yres;
  uint8_t header[12];
  writeNumber(header, frame.xres);
  writeNumber(header + 4, frame.yres);
  writeNumber(header + 8, static_cast<uint32_t>(displayAspect * 100000.0f));
  return std::fwrite(header, 1, sizeof(header), stdout) == sizeof(header)
    && std::fwrite(rgba.data(), 1, rgba.size(), stdout) == rgba.size()
    && std::fflush(stdout) == 0;
}

bool writeAudio(const NDIlib_audio_frame_v3_t& frame, std::vector<float>& pcm) {
  if (frame.FourCC != NDIlib_FourCC_audio_type_FLTP || !frame.p_data
    || frame.sample_rate < 8000 || frame.sample_rate > 192000 || frame.no_channels < 1
    || frame.no_samples < 1 || frame.no_samples > 96000
    || (frame.no_channels > 1 && (frame.channel_stride_in_bytes % sizeof(float) != 0
      || frame.channel_stride_in_bytes < frame.no_samples * static_cast<int>(sizeof(float))))) return true;

  const auto left = reinterpret_cast<const float*>(frame.p_data);
  const auto right = reinterpret_cast<const float*>(frame.p_data + (frame.no_channels > 1 ? frame.channel_stride_in_bytes : 0));
  const int blockSize = frame.sample_rate / 50;
  const auto toPcm = [](float value) { return std::isfinite(value) ? std::clamp(value * 0.1f, -1.0f, 1.0f) : 0.0f; };
  for (int offset = 0; offset < frame.no_samples; offset += blockSize) {
    const int samples = std::min(blockSize, frame.no_samples - offset);
    pcm.resize(samples * 2);
    for (int i = 0; i < samples; i++) {
      pcm[i] = toPcm(left[offset + i]);
      pcm[samples + i] = toPcm(right[offset + i]);
    }
    uint8_t header[12];
    // Width zero distinguishes an audio header from a video header.
    writeNumber(header, 0);
    writeNumber(header + 4, frame.sample_rate);
    writeNumber(header + 8, samples);
    if (std::fwrite(header, 1, sizeof(header), stdout) != sizeof(header)
      || std::fwrite(pcm.data(), sizeof(float), pcm.size(), stdout) != pcm.size()) return false;
  }
  return std::fflush(stdout) == 0;
}

int receive(const Library& ndi, NDIlib_find_instance_t finder, const char* name) {
  NDIlib_recv_instance_t receiver{};
  while (!receiver && !parentClosed) {
    uint32_t count = 0;
    const auto sources = ndi.sources(finder, &count);
    for (uint32_t index = 0; index < count; index++) {
      if (!sources[index].p_ndi_name || std::strcmp(sources[index].p_ndi_name, name) != 0) continue;
      NDIlib_recv_create_v3_t options{};
      options.source_to_connect_to = sources[index];
      options.color_format = NDIlib_recv_color_format_RGBX_RGBA;
      options.bandwidth = NDIlib_recv_bandwidth_highest;
      receiver = ndi.recvCreate(&options);
      if (!receiver) return fail("receiver");
      break;
    }
    if (!receiver) ndi.wait(finder, 400);
  }
  if (!receiver) return 0;

  std::vector<uint8_t> rgba;
  std::vector<float> pcm;
  auto lastFrame = Clock::time_point{};
  while (!parentClosed) {
    NDIlib_video_frame_v2_t frame{};
    NDIlib_audio_frame_v3_t audio{};
    const auto type = ndi.capture(receiver, &frame, &audio, nullptr, 400);
    if (type == NDIlib_frame_type_error) break;
    if (type == NDIlib_frame_type_audio) {
      const bool healthy = writeAudio(audio, pcm);
      ndi.freeAudio(receiver, &audio);
      if (!healthy) break;
      continue;
    }
    if (type != NDIlib_frame_type_video) continue;
    const auto now = Clock::now();
    bool healthy = true;
    // Pace IPC near 30 fps when the source sends faster.
    if (validFrame(frame) && now - lastFrame >= std::chrono::milliseconds(30)) {
      healthy = writeFrame(frame, rgba);
      lastFrame = now;
    }
    ndi.freeVideo(receiver, &frame);
    if (!healthy) break;
  }
  ndi.recvDestroy(receiver);
  return parentClosed ? 0 : fail("receiver");
}

int discover(const Library& ndi, NDIlib_find_instance_t finder) {
  const auto deadline = Clock::now() + std::chrono::milliseconds(1800);
  while (Clock::now() < deadline) ndi.wait(finder, 100);
  uint32_t count = 0;
  const auto sources = ndi.sources(finder, &count);
  for (uint32_t index = 0; index < count; index++) {
    const auto* name = sources[index].p_ndi_name;
    if (name && std::fwrite(name, 1, std::strlen(name) + 1, stdout) != std::strlen(name) + 1) return fail("receiver");
  }
  return std::fflush(stdout) == 0 ? 0 : fail("receiver");
}

int run(Module module, bool list, const char* sourceName) {
  const auto initialize = symbol<decltype(&NDIlib_initialize)>(module, "NDIlib_initialize");
  const auto destroy = symbol<decltype(&NDIlib_destroy)>(module, "NDIlib_destroy");
  const Library ndi{
    symbol<decltype(&NDIlib_find_create_v2)>(module, "NDIlib_find_create_v2"),
    symbol<decltype(&NDIlib_find_destroy)>(module, "NDIlib_find_destroy"),
    symbol<decltype(&NDIlib_find_wait_for_sources)>(module, "NDIlib_find_wait_for_sources"),
    symbol<decltype(&NDIlib_find_get_current_sources)>(module, "NDIlib_find_get_current_sources"),
    symbol<decltype(&NDIlib_recv_create_v3)>(module, "NDIlib_recv_create_v3"),
    symbol<decltype(&NDIlib_recv_destroy)>(module, "NDIlib_recv_destroy"),
    symbol<decltype(&NDIlib_recv_capture_v3)>(module, "NDIlib_recv_capture_v3"),
    symbol<decltype(&NDIlib_recv_free_video_v2)>(module, "NDIlib_recv_free_video_v2"),
    symbol<decltype(&NDIlib_recv_free_audio_v3)>(module, "NDIlib_recv_free_audio_v3"),
  };
  if (!initialize || !destroy || !ndi.findCreate || !ndi.findDestroy || !ndi.wait || !ndi.sources
    || !ndi.recvCreate || !ndi.recvDestroy || !ndi.capture || !ndi.freeVideo || !ndi.freeAudio || !initialize()) return fail("runtime");

  NDIlib_find_create_t options{};
  options.show_local_sources = true;
  options.p_groups = std::getenv("WORSHIP_NDI_GROUPS");
  const auto finder = ndi.findCreate(&options);
  const int result = !finder ? fail("receiver") : list ? discover(ndi, finder) : receive(ndi, finder, sourceName);
  if (finder) ndi.findDestroy(finder);
  destroy();
  return result;
}

} // namespace

int main(int argc, char** argv) {
  if (argc != 2) return fail("receiver");
  const bool list = std::strcmp(argv[1], "discover") == 0;
  if (!list && std::strcmp(argv[1], "receive") != 0) return fail("receiver");
#ifdef _WIN32
  if (_setmode(_fileno(stdin), _O_BINARY) == -1 || _setmode(_fileno(stdout), _O_BINARY) == -1) return fail("receiver");
#endif
  char name[1025]{};
  if (!list) {
    size_t size = 0;
    for (int byte; (byte = std::getchar()) != 0;) {
      if (byte == EOF || size == sizeof(name) - 1) return fail("receiver");
      name[size++] = static_cast<char>(byte);
    }
    if (!size) return fail("receiver");
    std::thread([] {
      std::getchar();
      parentClosed = true;
    }).detach();
  }
  const auto module = loadRuntime();
  if (!module) return fail("runtime");
  const int result = run(module, list, name);
  closeModule(module);
  return result;
}
