// scripts/patch-expo-modules-core.cjs
// Idempotently patches expo-modules-core CMake files to prevent Windows MAX_PATH collisions in CMake and Ninja.

const fs = require('fs');
const path = require('path');

function findExpoModulesCoreDirs() {
  const nodeModulesDir = path.resolve(__dirname, '..', 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) return [];

  const matches = [];
  function search(dir, depth = 0) {
    if (depth > 6) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);
          if (entry.name === 'expo-modules-core') {
            const androidCMake = path.join(fullPath, 'android', 'CMakeLists.txt');
            if (fs.existsSync(androidCMake)) {
              matches.push(fullPath);
            }
          } else if (entry.name !== '.bin' && entry.name !== 'build' && entry.name !== '.cxx') {
            search(fullPath, depth + 1);
          }
        }
      }
    } catch {
      // Ignore permission or read errors
    }
  }

  search(nodeModulesDir);
  return matches;
}

function patchDir(expoDir) {
  // 1. Patch android/CMakeLists.txt
  const cmakePath = path.join(expoDir, 'android', 'CMakeLists.txt');
  if (fs.existsSync(cmakePath)) {
    let content = fs.readFileSync(cmakePath, 'utf8');

    // Ensure CMAKE_OBJECT_PATH_MAX is set to 260
    if (!content.includes('CMAKE_OBJECT_PATH_MAX')) {
      content = 'set(CMAKE_OBJECT_PATH_MAX 260)\n' + content;
    }

    // Bypass find_package(ReactAndroid) with direct includes to prevent 286+ char relative paths
    if (content.includes('find_package(ReactAndroid REQUIRED CONFIG)') && !content.includes('FOUND_REACT')) {
      const targetBlock = `find_package(ReactAndroid REQUIRED CONFIG)\nfind_package(fbjni REQUIRED CONFIG)`;
      const replacementBlock = `foreach(ROOT_DIR \${CMAKE_FIND_ROOT_PATH})
  file(TO_CMAKE_PATH "\${ROOT_DIR}" ROOT_NORM)
  file(GLOB_RECURSE FOUND_REACT "\${ROOT_NORM}/*ReactAndroidConfig.cmake")
  if (FOUND_REACT)
    set(REACT_CONFIG "\${FOUND_REACT}")
  endif()
  file(GLOB_RECURSE FOUND_FBJNI "\${ROOT_NORM}/*fbjniConfig.cmake")
  if (FOUND_FBJNI)
    set(FBJNI_CONFIG "\${FOUND_FBJNI}")
  endif()
endforeach()

if (REACT_CONFIG)
  include("\${REACT_CONFIG}")
endif()
set(ReactAndroid_VERSION_MINOR 79 CACHE STRING "" FORCE)

if (FBJNI_CONFIG)
  include("\${FBJNI_CONFIG}")
endif()`;
      content = content.replace(targetBlock, replacementBlock);
    }

    fs.writeFileSync(cmakePath, content, 'utf8');
    console.log(`[patch-expo-modules-core] Patched: ${cmakePath}`);
  }

  // 2. Patch android/src/fabric/CMakeLists.txt
  const fabricCMakePath = path.join(expoDir, 'android', 'src', 'fabric', 'CMakeLists.txt');
  if (fs.existsSync(fabricCMakePath)) {
    let content = fs.readFileSync(fabricCMakePath, 'utf8');
    if (content.includes('${SOURCES}\n  ${COMMON_FABRIC_SOURCES}')) {
      content = content.replace('${SOURCES}\n  ${COMMON_FABRIC_SOURCES}', '${SOURCES}');
      fs.writeFileSync(fabricCMakePath, content, 'utf8');
      console.log(`[patch-expo-modules-core] Patched: ${fabricCMakePath}`);
    }
  }
}

const dirs = findExpoModulesCoreDirs();
if (dirs.length === 0) {
  console.log('[patch-expo-modules-core] No expo-modules-core directory found to patch.');
} else {
  for (const d of dirs) {
    patchDir(d);
  }
}

