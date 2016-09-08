Contains a patch that can be applied to the platforms/base repository of the
AOSP source code intended for the Nexus 6P device (android-6.0.1_r45).

These instructions are modified from the [rico_aosp project](../rico_aosp/nexus6p/README.md)

## Usage

### Setting Up the Build Environment
Instructions on the [AOSP website](https://source.android.com/source/initializing.html).

### Downloading AOSP source
```bash
mkdir ~/android-6.0.1_r45
cd ~/android-6.0.1_r45
repo init -u https://android.googlesource.com/platform/manifest -b android-6.0.1_r45
repo sync
 ```

### Patching the source files
```bash
cd frameworks/base
patch -p1 < $JIRI_ROOT/experimental/projects/aosp_superclasses/nexus6p/patch/patch.diff
 ```

If you plan on installing Google Play services or other GmsCore apps on this
build, you should also apply the following patch that fixes permission issues.
```bash
patch -p1 < vanadium/release/projects/luma_third_party/gapps_aosp_patch/patch.diff
 ```

### Downloading Nexus 6P binaries
```bash
cd ~/android-6.0.1_r45
wget https://dl.google.com/dl/android/aosp/huawei-angler-3020518-2609fde4.tgz
tar -xvzf huawei-angler-3020518-2609fde4.tgz
./extract-huawei-angler.sh
rm huawei-angler-3020518-2609fde4.tgz
wget https://dl.google.com/dl/android/aosp/qcom-angler-3020518-c3c4c7af.tgz
tar -xvzf qcom-angler-3020518-c3c4c7af.tgz
./extract-qcom-angler.sh
rm qcom-angler-3020518-c3c4c7af.tgz
 ```

### Building AOSP source for Angler (Nexus 6P)
```bash
source build/envsetup.sh
lunch aosp_angler-eng
make -j16   # Uses 16 threads.
```

The output will be in android-6.0.1_r45/out/target/product/angler/

### Flashing a phone
With the phone connected over USB the following:
* Go to Settings and click on About Phone 7 times to enable developer mode.
* Go to Settings > Developer Options and Enable USB Debugging.
* If it is the first time you are flashing the device, you will have to
unlock the device. Go to Settings > Developer Options and enable OEM Unlocking.
* Then flash the build using:
```bash
adb reboot bootloader
fastboot flashing unlock # Only needed for the first time to unlock the device.
cd out/target/product/angler
fastboot -w flashall
```
### Getting view hierarchies
Use [Android Hierarchy Viewer](https://developer.android.com/studio/profile/hierarchy-viewer.html)
from Android Studio by choosing Tools > Android > Android Device Monitor or
click Android Device Monitor in the toolbar.
