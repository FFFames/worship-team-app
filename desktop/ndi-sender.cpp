// Publishes Electron video frames to an NDI source.
#include "ndi-runtime.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <cstddef>
#include <string>
#include <vector>

namespace {

using namespace worship_ndi;
constexpr int framesPerSecond = 30;
constexpr int audioSamples = 480;
constexpr int audioChannels = 2;
constexpr int audioRate = 48000;

void toStraightAlpha(std::vector<uint8_t>& buffer) {
  // Electron's compositor gives us premultiplied BGRA. NDI's BGRA uses straight alpha.
  for (size_t i = 0; i < buffer.size(); i += 4) {
    const unsigned alpha = buffer[i + 3];
    if (alpha == 255) continue;
    for (size_t channel = i; channel < i + 3; ++channel) {
      buffer[channel] = alpha == 0 ? 0 : std::min(255u, (buffer[channel] * 255u + alpha / 2) / alpha);
    }
  }
}

int publish(Module module, const char* name, int width, int height, bool multiplexed) {
  const auto initialize = symbol<decltype(&NDIlib_initialize)>(module, "NDIlib_initialize");
  const auto destroy = symbol<decltype(&NDIlib_destroy)>(module, "NDIlib_destroy");
  const auto createSender = symbol<decltype(&NDIlib_send_create)>(module, "NDIlib_send_create");
  const auto destroySender = symbol<decltype(&NDIlib_send_destroy)>(module, "NDIlib_send_destroy");
  const auto sendVideo = symbol<decltype(&NDIlib_send_send_video_v2)>(module, "NDIlib_send_send_video_v2");
  const auto sendAudio = symbol<decltype(&NDIlib_send_send_audio_v3)>(module, "NDIlib_send_send_audio_v3");
  const auto sourceName = symbol<decltype(&NDIlib_send_get_source_name)>(module, "NDIlib_send_get_source_name");
  if (!initialize || !destroy || !createSender || !destroySender || !sendVideo || !sourceName || (multiplexed && !sendAudio)) {
    return fail("runtime");
  }
  if (!initialize()) return fail("runtime");

  NDIlib_send_create_t options{};
  options.p_ndi_name = name;
  options.p_groups = std::getenv("WORSHIP_NDI_GROUPS");
  // Clock each frame on the Electron side so an unchanged slide remains visible.
  options.clock_video = false;
  options.clock_audio = false;
  const auto sender = createSender(&options);
  if (!sender) {
    destroy();
    return fail("publisher");
  }

  std::vector<uint8_t> buffer(static_cast<size_t>(width) * height * 4);
  NDIlib_video_frame_v2_t frame{};
  frame.xres = width;
  frame.yres = height;
  frame.FourCC = NDIlib_FourCC_video_type_BGRA;
  frame.frame_rate_N = framesPerSecond;
  frame.frame_rate_D = 1;
  frame.picture_aspect_ratio = 16.0f / 9.0f;
  frame.frame_format_type = NDIlib_frame_format_type_progressive;
  frame.timecode = NDIlib_send_timecode_synthesize;
  frame.p_data = buffer.data();
  frame.line_stride_in_bytes = width * 4;

  std::vector<float> pcm(audioSamples * audioChannels);
  NDIlib_audio_frame_v3_t audio{};
  audio.sample_rate = audioRate;
  audio.no_channels = audioChannels;
  audio.no_samples = audioSamples;
  audio.FourCC = NDIlib_FourCC_audio_type_FLTP;
  audio.timecode = NDIlib_send_timecode_synthesize;
  audio.p_data = reinterpret_cast<uint8_t*>(pcm.data());
  audio.channel_stride_in_bytes = audioSamples * sizeof(float);

  const auto source = sourceName(sender);
  std::printf("READY\t%s\n", source && source->p_ndi_name ? source->p_ndi_name : "");
  std::fflush(stdout);
  bool invalidPacket = false;
  while (true) {
    const int packet = multiplexed ? std::fgetc(stdin) : 0;
    if (packet == 0) {
      if (std::fread(buffer.data(), 1, buffer.size(), stdin) != buffer.size()) break;
      toStraightAlpha(buffer);
      sendVideo(sender, &frame);
    } else if (packet == 1) {
      if (std::fread(pcm.data(), sizeof(float), pcm.size(), stdin) != pcm.size()) break;
      // SMPTE reference is -20 dBFS at NDI floating-point unity.
      for (auto& sample : pcm) sample = std::isfinite(sample) ? std::clamp(sample, -1.0f, 1.0f) * 10.0f : 0.0f;
      sendAudio(sender, &audio);
    } else {
      invalidPacket = packet != EOF;
      break;
    }
  }

  destroySender(sender);
  destroy();
  return invalidPacket || std::ferror(stdin) ? fail("publisher") : 0;
}

} // namespace

int main(int argc, char** argv) {
  const bool multiplexed = argc == 4 && std::strcmp(argv[3], "--av") == 0;
  if (argc != 3 && !multiplexed) return fail("publisher");
  const std::string resolution = argv[2];
  if (resolution != "720" && resolution != "1080") return fail("publisher");
  const int height = std::atoi(argv[2]);
  const int width = height * 16 / 9;
#ifdef _WIN32
  if (_setmode(_fileno(stdin), _O_BINARY) == -1) return fail("publisher");
#endif
  const auto module = loadRuntime();
  if (!module) return fail("runtime");
  const int result = publish(module, argv[1], width, height, multiplexed);
  closeModule(module);
  return result;
}
