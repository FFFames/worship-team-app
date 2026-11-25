// Loads the separately installed NDI SDK runtime.
#pragma once

#include <cstdio>
#include <cstdlib>
#include <filesystem>

#define NDILIB_CPP_DEFAULT_CONSTRUCTORS 0
#include <Processing.NDI.Lib.h>

#ifdef _WIN32
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#else
#include <dlfcn.h>
#endif

namespace worship_ndi {

#if defined(_WIN32)
#if defined(_M_ARM64) || defined(__aarch64__)
constexpr auto runtimeName = "Processing.NDI.Lib.ARM64.dll";
#else
constexpr auto runtimeName = "Processing.NDI.Lib.x64.dll";
#endif
using Module = HMODULE;
inline Module openModule(const std::filesystem::path& file) { return LoadLibraryW(file.c_str()); }
inline void closeModule(Module module) { FreeLibrary(module); }
template<class T> T symbol(Module module, const char* name) {
  return reinterpret_cast<T>(GetProcAddress(module, name));
}
#else
#if defined(__APPLE__)
constexpr auto runtimeName = "libndi.dylib";
#else
constexpr auto runtimeName = "libndi.so.6";
#endif
using Module = void*;
inline Module openModule(const std::filesystem::path& file) { return dlopen(file.c_str(), RTLD_NOW | RTLD_LOCAL); }
inline void closeModule(Module module) { dlclose(module); }
template<class T> T symbol(Module module, const char* name) {
  return reinterpret_cast<T>(dlsym(module, name));
}
#endif

inline Module loadRuntime() {
  if (const auto* file = std::getenv("WORSHIP_NDI_RUNTIME")) {
    if (*file) return openModule(std::filesystem::u8path(file));
  }
  if (const auto* directory = std::getenv("NDI_RUNTIME_DIR_V6")) {
    if (*directory) {
      if (const auto module = openModule(std::filesystem::u8path(directory) / runtimeName)) return module;
    }
  }
#ifdef __APPLE__
  if (const auto module = openModule("/usr/local/lib/libndi.dylib")) return module;
#endif
  return openModule(runtimeName);
}

inline int fail(const char* code) {
  std::fprintf(stderr, "%s\n", code);
  return 1;
}

} // namespace worship_ndi
