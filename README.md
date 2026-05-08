## Methods of Synthesis of Virtual Reality (VR)
This project was developed as part of the university curriculum for the "Methods of Synthesis of Virtual Reality" course. It demonstrates advanced real-time rendering techniques using WebGL, specifically focused on anaglyphic stereo imaging and computer vision integration.

## Key Features
Anaglyphic Stereo Rendering: Generates a 3D stereo effect (Red-Cyan) for 3D models.
Dual-Layer Visualization: Renders the model in wireframe mode overlaid on top of filled polygons.
Negative Parallax: Specifically configured to create an "out-of-screen" 3D effect.
Camera Integration: Renders a real-time video stream from your web camera at the zero-parallax plane (as a background).
Interactive Controls: Full mouse-based rotation of the model around its center of mass.

## Configurable Parameters
The application provides a GUI or control interface to dynamically adjust:
Eye Separation: Adjust the distance between virtual eyes to control depth intensity.
Field of View (FoV): Change the viewing angle of the virtual camera.
Near Clipping Distance: Define the closest point visible to the camera.
Convergence Distance: Set the distance at which the left and right images overlap perfectly (zero parallax).