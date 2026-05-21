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
let orientationNeedle;
let magnetometerSocket = null;

const MAGNETOMETER_SENSOR_TYPE = 'android.sensor.magnetic_field';
const SENSOR_URL_STORAGE_KEY = 'pa2SensorServerUrl';
const SENSOR_SMOOTHING = 0.18;

const sensorState = {
    connected: false,
    enabled: true,
    hasReading: false,
    raw: [0, 0, 0],
    accuracy: null,
    headingRad: 0,
    filteredHeadingRad: 0,
    zeroOffsetRad: 0,
    magnitude: 0,
    samples: 0,
    lastMessageAt: 0
};

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
    const surfaceMatrix = getSurfaceOrientationMatrix();
    const modelView = eyeModelView.call(stereoCam, surfaceMatrix);
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

    drawOrientationNeedle(eyeModelView, surfaceMatrix);
}

function getSurfaceOrientationMatrix() {
    if (sensorState.enabled && sensorState.hasReading) {
        const headingRad = normalizeAngle(sensorState.filteredHeadingRad - sensorState.zeroOffsetRad);
        const sensorYawMatrix = createMagnetometerOrientationMatrix(headingRad);

        return m4.multiply(
            m4.translation(0, 0, -MODEL_NEGATIVE_PARALLAX_DISTANCE),
            sensorYawMatrix
        );
    }

    return spaceball.getViewMatrix();
}

function createMagnetometerOrientationMatrix(headingRad) {
    // Variant 14 uses only the magnetometer vector. Without accelerometer data
    // there is no reliable pitch/roll compensation, so the orientation matrix
    // contains compass-like yaw rotation only.
    return m4.yRotation(-headingRad);
}

function drawOrientationNeedle(eyeModelView, surfaceMatrix) {
    if (!orientationNeedle) {
        return;
    }

    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, eyeModelView.call(stereoCam, surfaceMatrix));
    gl.uniform1i(shProgram.iUseTexture, 0);
    gl.uniform4fv(shProgram.iColor, [0.95, 0.82, 0.32, 1.0]);
    orientationNeedle.Draw();

    gl.lineWidth(1.0);
    gl.uniform4fv(shProgram.iColor, [0.05, 0.05, 0.07, 1.0]);
    orientationNeedle.DrawWireframe();
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

    const needleData = {};
    CreateCompassNeedleData(needleData);
    orientationNeedle = new Model('Compass orientation marker');
    orientationNeedle.BufferData(needleData.verticesF32, needleData.indicesU16);

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

    initSensorControls();

    requestAnimationFrame(renderFrame);
}


function initSensorControls() {
    const urlInput = document.getElementById('sensorUrl');
    const connectButton = document.getElementById('connectSensorButton');
    const disconnectButton = document.getElementById('disconnectSensorButton');
    const calibrateButton = document.getElementById('calibrateSensorButton');
    const useSensorCheckbox = document.getElementById('useSensorRotation');

    if (urlInput) {
        const savedUrl = localStorage.getItem(SENSOR_URL_STORAGE_KEY);
        if (savedUrl) {
            urlInput.value = savedUrl;
        }
    }

    if (connectButton) {
        connectButton.addEventListener('click', connectMagnetometerSensor);
    }

    if (disconnectButton) {
        disconnectButton.addEventListener('click', disconnectMagnetometerSensor);
    }

    if (calibrateButton) {
        calibrateButton.addEventListener('click', calibrateMagnetometerZero);
    }

    if (useSensorCheckbox) {
        sensorState.enabled = useSensorCheckbox.checked;
        useSensorCheckbox.addEventListener('change', function() {
            sensorState.enabled = useSensorCheckbox.checked;
            updateSensorStatus(
                sensorState.enabled
                    ? 'Sensor rotation is enabled.'
                    : 'Sensor rotation is disabled. Use mouse/touch to rotate the surface.',
                sensorState.enabled ? 'ok' : 'warning'
            );
        });
    }

    updateSensorReadout();
}

function connectMagnetometerSensor() {
    const urlInput = document.getElementById('sensorUrl');
    const rawUrl = urlInput ? urlInput.value.trim() : '';
    const sensorUrl = buildSensorWebSocketUrl(rawUrl);

    if (!sensorUrl) {
        updateSensorStatus('Enter the Android Sensor Server WebSocket URL.', 'danger');
        return;
    }

    if (location.protocol === 'https:' && sensorUrl.startsWith('ws://')) {
        updateSensorStatus('The page is opened through HTTPS, so the browser may block insecure ws://. Run this page through http://localhost or use wss://.', 'warning');
    }

    localStorage.setItem(SENSOR_URL_STORAGE_KEY, sensorUrl);
    disconnectMagnetometerSensor(false);

    try {
        magnetometerSocket = new WebSocket(sensorUrl);
    } catch (error) {
        updateSensorStatus('WebSocket URL is invalid: ' + error.message, 'danger');
        return;
    }

    const activeSocket = magnetometerSocket;

    setSensorButtonsBusy(true);
    updateSensorStatus('Connecting to Sensor Server...', 'warning');

    activeSocket.addEventListener('open', function() {
        if (magnetometerSocket !== activeSocket) {
            return;
        }

        sensorState.connected = true;
        setSensorButtonsBusy(false);
        updateSensorStatus('Connected. Rotate the phone flat on the table to rotate the surface like a compass.', 'ok');
    });

    activeSocket.addEventListener('message', function(event) {
        if (magnetometerSocket === activeSocket) {
            handleMagnetometerMessage(event.data);
        }
    });

    activeSocket.addEventListener('error', function() {
        if (magnetometerSocket !== activeSocket) {
            return;
        }

        updateSensorStatus('WebSocket error. Check phone IP/port, Sensor Server status and Wi‑Fi network.', 'danger');
        setSensorButtonsBusy(false);
    });

    activeSocket.addEventListener('close', function() {
        if (magnetometerSocket !== activeSocket) {
            return;
        }

        sensorState.connected = false;
        setSensorButtonsBusy(false);
        updateSensorStatus('Disconnected from Sensor Server.', sensorState.hasReading ? 'warning' : 'danger');
        magnetometerSocket = null;
    });
}

function disconnectMagnetometerSensor(showStatus) {
    if (showStatus === undefined) {
        showStatus = true;
    }

    if (magnetometerSocket) {
        const socket = magnetometerSocket;
        magnetometerSocket = null;
        socket.close();
    }

    sensorState.connected = false;
    setSensorButtonsBusy(false);

    if (showStatus) {
        updateSensorStatus('Disconnected. Last received orientation is kept until a new connection is opened.', 'warning');
    }
}

function buildSensorWebSocketUrl(input) {
    if (!input) {
        return '';
    }

    if (input.startsWith('ws://') || input.startsWith('wss://')) {
        return input;
    }

    const host = input.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return 'ws://' + host + '/sensor/connect?type=' + encodeURIComponent(MAGNETOMETER_SENSOR_TYPE);
}

function handleMagnetometerMessage(rawMessage) {
    const payload = parseSensorPayload(rawMessage);
    if (!payload || !payload.values || payload.values.length < 3) {
        return;
    }

    const mx = Number(payload.values[0]);
    const my = Number(payload.values[1]);
    const mz = Number(payload.values[2]);

    if (!Number.isFinite(mx) || !Number.isFinite(my) || !Number.isFinite(mz)) {
        return;
    }

    updateMagnetometerOrientation(mx, my, mz, payload.accuracy);
}

function parseSensorPayload(rawMessage) {
    let data;

    try {
        data = JSON.parse(rawMessage);
    } catch (error) {
        console.warn('Sensor message is not JSON:', rawMessage);
        return null;
    }

    if (data && Array.isArray(data.values)) {
        return data;
    }

    if (Array.isArray(data) && data.length >= 3) {
        return { values: data };
    }

    if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i += 1) {
            if (data[i] && Array.isArray(data[i].values)) {
                return data[i];
            }
        }
    }

    if (data && data[MAGNETOMETER_SENSOR_TYPE] && Array.isArray(data[MAGNETOMETER_SENSOR_TYPE].values)) {
        return data[MAGNETOMETER_SENSOR_TYPE];
    }

    return null;
}

function updateMagnetometerOrientation(mx, my, mz, accuracy) {
    const horizontalMagnitude = Math.sqrt(mx * mx + my * my);
    const magnitude = Math.sqrt(mx * mx + my * my + mz * mz);

    if (horizontalMagnitude < 0.001) {
        updateSensorStatus('Magnetometer horizontal vector is too small. Keep the phone flat and away from metal objects.', 'warning');
        return;
    }

    const headingRad = normalizeAngle(Math.atan2(-mx, my));

    if (!sensorState.hasReading) {
        sensorState.filteredHeadingRad = headingRad;
    } else {
        const delta = shortestAngleDelta(sensorState.filteredHeadingRad, headingRad);
        sensorState.filteredHeadingRad = normalizeAngle(sensorState.filteredHeadingRad + delta * SENSOR_SMOOTHING);
    }

    sensorState.connected = true;
    sensorState.hasReading = true;
    sensorState.raw = [mx, my, mz];
    sensorState.accuracy = accuracy;
    sensorState.headingRad = headingRad;
    sensorState.magnitude = magnitude;
    sensorState.samples += 1;
    sensorState.lastMessageAt = performance.now();

    updateSensorReadout();
}

function calibrateMagnetometerZero() {
    if (!sensorState.hasReading) {
        updateSensorStatus('No magnetometer data yet. Connect Sensor Server first.', 'warning');
        return;
    }

    sensorState.zeroOffsetRad = sensorState.filteredHeadingRad;
    updateSensorStatus('Current phone direction is saved as zero. Further rotations are applied relative to this direction.', 'ok');
    updateSensorReadout();
}

function updateSensorReadout() {
    const heading = document.getElementById('sensorHeading');
    const magnitude = document.getElementById('sensorMagnitude');
    const values = document.getElementById('sensorValues');
    const accuracy = document.getElementById('sensorAccuracy');

    if (!sensorState.hasReading) {
        setText(heading, '—');
        setText(magnitude, '—');
        setText(values, '—');
        setText(accuracy, '—');
        return;
    }

    const relativeHeading = normalizeAngle(sensorState.filteredHeadingRad - sensorState.zeroOffsetRad);
    setText(heading, formatDegrees(relativeHeading) + '°');
    setText(magnitude, sensorState.magnitude.toFixed(1) + ' µT');
    setText(values, sensorState.raw.map(function(value) { return value.toFixed(1); }).join(', '));
    setText(accuracy, sensorState.accuracy === null || sensorState.accuracy === undefined ? '—' : String(sensorState.accuracy));
}

function updateSensorStatus(message, mode) {
    const status = document.getElementById('sensorStatus');
    if (!status) {
        return;
    }

    status.textContent = message;
    status.classList.remove('ok', 'warning', 'danger');
    if (mode) {
        status.classList.add(mode);
    }
}

function setSensorButtonsBusy(isBusy) {
    const connectButton = document.getElementById('connectSensorButton');
    if (connectButton) {
        connectButton.disabled = isBusy;
    }
}

function setText(element, value) {
    if (element) {
        element.textContent = value;
    }
}

function normalizeAngle(angle) {
    let normalized = angle;
    while (normalized <= -Math.PI) {
        normalized += Math.PI * 2.0;
    }
    while (normalized > Math.PI) {
        normalized -= Math.PI * 2.0;
    }
    return normalized;
}

function shortestAngleDelta(fromAngle, toAngle) {
    return normalizeAngle(toAngle - fromAngle);
}

function formatDegrees(radians) {
    const degrees = radians * 180.0 / Math.PI;
    const positiveDegrees = (degrees + 360.0) % 360.0;
    return positiveDegrees.toFixed(1);
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
