# Methods of Synthesis of Virtual Reality — PA#2 Tangible Interface

This branch implements **PA #2 (Tangible interface)** on top of the PA #1 WebGL application.

The application keeps the original PA #1 functionality:

- WebGL DROP surface rendering;
- anaglyphic red/cyan stereo camera;
- configurable eye separation, field of view, near clipping distance and convergence distance;
- webcam texture rendered in the zero-parallax plane;
- mouse/touch trackball fallback for manual rotation.

PA #2 adds Android smartphone control through a tangible interface:

- the phone works as a physical controller;
- the browser connects to **Android Sensor Server** through WebSocket;
- the application receives hardware magnetometer readings;
- magnetometer vector `values[0..2]` is converted to a compass heading;
- the heading is converted to a 4×4 orientation matrix;
- the DROP surface and its compass marker are rotated according to the phone orientation.

## Variant 14

> Implement surface rotation based on hardware magnetometer sensor readings. As the magnetometer provides a single vector a compass-like orientation is possible only.

This implementation follows variant 14. Since only the magnetometer vector is used, the application performs **yaw-only compass rotation** around the vertical axis. Pitch and roll are intentionally not implemented because they require additional sensor fusion, for example with accelerometer/gyroscope data.
