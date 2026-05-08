'use strict';

let gl;
let surface;
let videoPlane;
let shProgram;
let spaceball;
let stereoCam;
let webcamVideo;
let webcamTexture;
let webcamReady = false;
let webcamStarted = false;

const FAR_CLIPPING_DISTANCE = 120.0;
// The DROP surface is intentionally placed in front of the convergence plane.
// This creates negative parallax, so with anaglyph glasses it appears closer
// than the webcam stream.
const MODEL_NEGATIVE_PARALLAX_DISTANCE = 5.2;

const settings = {
    convergence: 8.0,
    eyeSeparation: 0.34,
    fovDegrees: 45.0,
    nearClippingDistance: 1.0,
    farClippingDistance: FAR_CLIPPING_DISTANCE
};

function ShaderProgram(name, program) {
    this.name = name;
    this.prog = program;
    this.iAttribVertex = -1;
    this.iAttribTexCoord = -1;
    this.iColor = -1;
    this.iModelViewMatrix = -1;
    this.iProjectionMatrix = -1;
    this.iUseTexture = -1;
    this.iTextureSampler = -1;
    this.iTextureAlpha = -1;

    this.Use = function() {
        gl.useProgram(this.prog);
    };
}

function renderFrame() {
    resizeCanvasToDisplaySize(gl.canvas);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    stereoCam.setAspectRatio(gl.canvas.width / gl.canvas.height);
    stereoCam.update(settings);

    updateWebcamTexture();

    gl.clearColor(0.015, 0.018, 0.026, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    drawEye(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    drawEye(false);

    gl.colorMask(true, true, true, true);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    requestAnimationFrame(renderFrame);
}

function drawEye(isLeftEye) {
    const projection = isLeftEye
        ? stereoCam.calcLeftFrustum()
        : stereoCam.calcRightFrustum();

    const eyeModelView = isLeftEye
        ? stereoCam.calcLeftEyeModelView
        : stereoCam.calcRightEyeModelView;

    gl.colorMask(isLeftEye, !isLeftEye, !isLeftEye, true);
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, projection);

    drawWebcamPlane(eyeModelView);
    drawStereoSurface(eyeModelView);
}

function drawWebcamPlane(eyeModelView) {
    const halfHeight = settings.convergence * Math.tan(degToRad(settings.fovDegrees) / 2.0);
    const height = halfHeight * 2.0;
    const width = height * stereoCam.aspectRatio;
    const base = m4.multiply(
        m4.translation(0, 0, -settings.convergence),
        m4.scaling(width, height, 1)
    );

    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, eyeModelView.call(stereoCam, base));

    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (webcamReady) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
        gl.uniform1i(shProgram.iTextureSampler, 0);
        gl.uniform1i(shProgram.iUseTexture, 1);
        gl.uniform1f(shProgram.iTextureAlpha, 0.78);
        gl.uniform4fv(shProgram.iColor, [1.0, 1.0, 1.0, 1.0]);
    } else {
        gl.uniform1i(shProgram.iUseTexture, 0);
        gl.uniform4fv(shProgram.iColor, [0.07, 0.085, 0.11, 1.0]);
    }

    videoPlane.Draw();

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.uniform1i(shProgram.iUseTexture, 0);
}

function drawStereoSurface(eyeModelView) {
    const modelView = eyeModelView.call(stereoCam, spaceball.getViewMatrix());
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, modelView);
    gl.uniform1i(shProgram.iUseTexture, 0);

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0);
    gl.uniform4fv(shProgram.iColor, [0.38, 0.38, 0.42, 1.0]);
    surface.Draw();
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.lineWidth(1.0);
    gl.uniform4fv(shProgram.iColor, [1.0, 1.0, 1.0, 1.0]);
    surface.DrawWireframe();
}

function initGL() {
    const prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

    shProgram = new ShaderProgram('Stereo shader', prog);
    shProgram.Use();

    shProgram.iAttribVertex = gl.getAttribLocation(prog, 'vertex');
    shProgram.iAttribTexCoord = gl.getAttribLocation(prog, 'texCoord');
    shProgram.iModelViewMatrix = gl.getUniformLocation(prog, 'ModelViewMatrix');
    shProgram.iProjectionMatrix = gl.getUniformLocation(prog, 'ProjectionMatrix');
    shProgram.iColor = gl.getUniformLocation(prog, 'color');
    shProgram.iUseTexture = gl.getUniformLocation(prog, 'useTexture');
    shProgram.iTextureSampler = gl.getUniformLocation(prog, 'textureSampler');
    shProgram.iTextureAlpha = gl.getUniformLocation(prog, 'textureAlpha');

    const surfaceData = {};
    CreateSurfaceData(surfaceData);
    surface = new Model('Parametric surface');
    surface.BufferData(surfaceData.verticesF32, surfaceData.indicesU16);

    const videoPlaneData = {};
    CreateVideoPlaneData(videoPlaneData, 1, 1);
    videoPlane = new Model('Zero-parallax webcam plane');
    videoPlane.BufferData(
        videoPlaneData.verticesF32,
        videoPlaneData.indicesU16,
        videoPlaneData.texCoordsF32
    );

    stereoCam = new StereoCamera(
        settings.convergence,
        settings.eyeSeparation,
        gl.canvas.width / gl.canvas.height,
        settings.fovDegrees,
        settings.nearClippingDistance,
        settings.farClippingDistance
    );

    webcamTexture = createInitialTexture();

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
}

function createInitialTexture() {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([18, 24, 34, 255])
    );
    return texture;
}

function updateWebcamTexture() {
    if (!webcamVideo || webcamVideo.readyState < webcamVideo.HAVE_CURRENT_DATA) {
        webcamReady = false;
        return;
    }

    gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        webcamVideo
    );
    webcamReady = true;
}

async function startWebcam() {
    const status = document.getElementById('webcamStatus');
    const startButton = document.getElementById('startWebcamButton');

    if (!webcamVideo) {
        webcamVideo = document.getElementById('webcamVideo');
    }

    if (!webcamVideo) {
        setWebcamStatus(status, 'Webcam video element was not found in index.html.');
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setWebcamStatus(status, 'Webcam API is not available. Use Chrome/Edge/Firefox on localhost or HTTPS.');
        return;
    }

    const isSafeOrigin = window.isSecureContext
        || location.hostname === 'localhost'
        || location.hostname === '127.0.0.1';

    if (!isSafeOrigin) {
        setWebcamStatus(status, 'Camera is blocked: run from http://localhost, http://127.0.0.1 or HTTPS.');
        return;
    }

    stopCurrentWebcamStream();

    try {
        if (startButton) {
            startButton.disabled = true;
        }
        setWebcamStatus(status, 'Requesting camera permission... Click Allow in the browser popup.');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        webcamVideo.muted = true;
        webcamVideo.playsInline = true;
        webcamVideo.srcObject = stream;

        await waitForVideoMetadata(webcamVideo);
        await webcamVideo.play();

        webcamStarted = true;
        webcamReady = true;
        setWebcamStatus(status, 'Camera is active. The video stream is rendered in the zero-parallax plane.');
    } catch (error) {
        webcamStarted = false;
        webcamReady = false;
        console.error('Webcam error:', error);

        const name = error && error.name ? error.name : 'Error';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            setWebcamStatus(status, 'Camera permission is blocked. Click the icon near the address bar → Camera → Allow, reload the page, then press Start.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            setWebcamStatus(status, 'No webcam was found. Connect/enable the camera and try again.');
        } else if (name === 'NotReadableError') {
            setWebcamStatus(status, 'The webcam is already used by another application. Close it and try again.');
        } else {
            setWebcamStatus(status, 'Webcam is unavailable: ' + (error.message || name));
        }
    } finally {
        if (startButton) {
            startButton.disabled = false;
        }
    }
}

function stopCurrentWebcamStream() {
    if (!webcamVideo || !webcamVideo.srcObject) {
        return;
    }

    const tracks = webcamVideo.srcObject.getTracks();
    for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].stop();
    }
    webcamVideo.srcObject = null;
}

function waitForVideoMetadata(video) {
    if (video.readyState >= video.HAVE_METADATA) {
        return Promise.resolve();
    }

    return new Promise(function(resolve) {
        video.onloadedmetadata = function() {
            resolve();
        };
    });
}

function setWebcamStatus(statusElement, message) {
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function tryAutoStartWebcamIfAlreadyAllowed() {
    if (!navigator.permissions || !navigator.permissions.query) {
        return;
    }

    navigator.permissions.query({ name: 'camera' })
        .then(function(permissionStatus) {
            if (permissionStatus.state === 'granted') {
                startWebcam();
            }
        })
        .catch(function() {
            // Some browsers do not support querying camera permission state.
        });
}

function createProgram(glContext, vShader, fShader) {
    const vsh = glContext.createShader(glContext.VERTEX_SHADER);
    glContext.shaderSource(vsh, vShader);
    glContext.compileShader(vsh);
    if (!glContext.getShaderParameter(vsh, glContext.COMPILE_STATUS)) {
        throw new Error('Error in vertex shader: ' + glContext.getShaderInfoLog(vsh));
    }

    const fsh = glContext.createShader(glContext.FRAGMENT_SHADER);
    glContext.shaderSource(fsh, fShader);
    glContext.compileShader(fsh);
    if (!glContext.getShaderParameter(fsh, glContext.COMPILE_STATUS)) {
        throw new Error('Error in fragment shader: ' + glContext.getShaderInfoLog(fsh));
    }

    const prog = glContext.createProgram();
    glContext.attachShader(prog, vsh);
    glContext.attachShader(prog, fsh);
    glContext.linkProgram(prog);
    if (!glContext.getProgramParameter(prog, glContext.LINK_STATUS)) {
        throw new Error('Link error in program: ' + glContext.getProgramInfoLog(prog));
    }

    return prog;
}

function init() {
    const canvas = document.getElementById('webglcanvas');
    webcamVideo = document.getElementById('webcamVideo');

    if (!canvas) {
        console.error('Canvas element #webglcanvas was not found.');
        return;
    }

    try {
        gl = canvas.getContext('webgl', { antialias: true, alpha: false });
        if (!gl) {
            throw new Error('Browser does not support WebGL');
        }
    } catch (error) {
        const holder = document.getElementById('canvas-holder');
        if (holder) {
            holder.innerHTML = '<p style="padding:16px">Sorry, could not get a WebGL graphics context.</p>';
        }
        return;
    }

    try {
        initControls();
        initGL();
    } catch (error) {
        const holder = document.getElementById('canvas-holder');
        if (holder) {
            holder.innerHTML = '<p style="padding:16px">Sorry, could not initialize the WebGL graphics context: ' + error + '</p>';
        }
        console.error(error);
        return;
    }

    spaceball = new TrackballRotator(
        canvas,
        null,
        MODEL_NEGATIVE_PARALLAX_DISTANCE,
        [0, 0, 10],
        [0, 1, 0]
    );
    spaceball.setRotationCenter([0, 0, 0]);

    const startButton = document.getElementById('startWebcamButton');
    if (startButton) {
        startButton.addEventListener('click', startWebcam);
    }

    requestAnimationFrame(renderFrame);
}

function initControls() {
    bindNumericControl('eyeSeparation', 'eyeSeparationValue', 'eyeSeparation');
    bindNumericControl('fovDegrees', 'fovDegreesValue', 'fovDegrees');
    bindNumericControl('nearClippingDistance', 'nearClippingDistanceValue', 'nearClippingDistance');
    bindNumericControl('convergence', 'convergenceValue', 'convergence');
}

function bindNumericControl(rangeId, numberId, settingName) {
    const range = document.getElementById(rangeId);
    const number = document.getElementById(numberId);

    if (!range || !number) {
        console.warn(
            'Control pair was not found:',
            rangeId,
            numberId,
            'The scene will continue with default value:',
            settings[settingName]
        );
        return;
    }

    const setBothInputs = function(value) {
        const rangePrecision = getPrecision(range.step);
        const numberPrecision = getPrecision(number.step);
        range.value = value.toFixed(rangePrecision);
        number.value = value.toFixed(numberPrecision);
    };

    const update = function(source) {
        let value = Number.parseFloat(source.value);
        const min = Number.parseFloat(source.min);
        const max = Number.parseFloat(source.max);

        if (!Number.isFinite(value)) {
            value = settings[settingName];
        }

        value = Math.min(Math.max(value, min), max);

        if (settingName === 'nearClippingDistance') {
            // Keep the projection valid: near plane must stay in front of the
            // zero-parallax/convergence plane.  The upper UI range is high
            // enough to visibly cut the DROP model when the slider is moved.
            value = Math.min(value, settings.convergence - 0.2);
        }
        if (settingName === 'convergence') {
            value = Math.max(value, settings.nearClippingDistance + 0.2);
        }

        settings[settingName] = value;
        setBothInputs(value);
        syncDependentControls(settingName);
    };

    setBothInputs(settings[settingName]);
    range.addEventListener('input', function() {
        update(range);
    });
    number.addEventListener('input', function() {
        update(number);
    });
}


function syncDependentControls(changedSettingName) {
    // When convergence is moved close to the near plane, update the paired UI
    // fields so the user sees the actual clamped values immediately.
    if (changedSettingName === 'nearClippingDistance') {
        updateControlDisplay('convergence', 'convergenceValue', settings.convergence);
    }
    if (changedSettingName === 'convergence') {
        updateControlDisplay('nearClippingDistance', 'nearClippingDistanceValue', settings.nearClippingDistance);
    }
}

function updateControlDisplay(rangeId, numberId, value) {
    const range = document.getElementById(rangeId);
    const number = document.getElementById(numberId);

    if (!range || !number) {
        return;
    }

    const rangePrecision = getPrecision(range.step);
    const numberPrecision = getPrecision(number.step);
    range.value = value.toFixed(rangePrecision);
    number.value = value.toFixed(numberPrecision);
}

function getPrecision(step) {
    const text = String(step);
    return text.includes('.') ? text.split('.')[1].length : 0;
}

function resizeCanvasToDisplaySize(canvas) {
    const displayWidth = Math.floor(canvas.clientWidth * window.devicePixelRatio);
    const displayHeight = Math.floor(canvas.clientHeight * window.devicePixelRatio);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
}

function degToRad(degrees) {
    return degrees * Math.PI / 180.0;
}


window.addEventListener('DOMContentLoaded', init);
