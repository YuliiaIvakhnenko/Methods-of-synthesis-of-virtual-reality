# Methods of Synthesis of Virtual Reality — Control Task

## AR registration template

This branch implements the **Control task (AR registration template)**.

The project uses a custom registration template for **variant 14** and renders the same DROP surface from PA#1/PA#2 dynamically aligned to this marker.

## What is implemented

- Custom marker image: `assets/pattern-14.png`.
- Custom AR.js pattern file: `assets/pattern-14.patt`.
- AR web application: `index.html`.
- Marker preview/printing page: `marker.html`.
- The PA#1/PA#2 DROP surface is recreated as a Three.js geometry inside `control-task.js`.
- The model is attached to the marker and follows the real registration template in real time.
