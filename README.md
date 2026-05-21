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

## How to run locally on a computer

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000/marker.html
```

This page shows the registration marker.

## How to test on a smartphone

Camera access on a smartphone normally requires HTTPS. The easiest option is to push this branch to GitHub and enable GitHub Pages.

Then open the GitHub Pages URL on the smartphone and point the camera at:

```text
marker.html
```

opened on the laptop screen, or at the printed marker from:

```text
assets/pattern-14.png
```

## Git branch for submission

The assignment must be submitted from the branch named:

```text
ControlTask
```

Useful commands:

```bash
git checkout -B ControlTask
git add .
git commit -m "Implement ControlTask AR registration template"
git push -u origin ControlTask
```

## Video recording checklist

Record a short video where the following is visible:

1. The custom marker with number 14.
2. The web AR application opened on the smartphone.
3. The phone camera pointed at the marker.
4. The DROP surface appearing above the marker.
5. The model staying aligned when the phone or marker is moved.

Place the recorded video in the repository, for example:

```text
presentation/control-task-demo.mp4
```

## Files for presentation

- Marker image: `assets/pattern-14.png`
- Original template image: `assets/14.png`
- Demo video location: `presentation/control-task-demo.mp4`
