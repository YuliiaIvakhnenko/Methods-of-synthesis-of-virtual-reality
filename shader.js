'use strict';

// Vertex shader
const vertexShaderSource = `
attribute vec3 vertex;
attribute vec2 texCoord;

uniform mat4 ModelViewMatrix;
uniform mat4 ProjectionMatrix;

varying vec2 vTexCoord;

void main() {
    vTexCoord = texCoord;
    gl_Position = ProjectionMatrix * ModelViewMatrix * vec4(vertex, 1.0);
}`;


// Fragment shader
const fragmentShaderSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
   precision highp float;
#else
   precision mediump float;
#endif

uniform vec4 color;
uniform sampler2D textureSampler;
uniform bool useTexture;
uniform float textureAlpha;

varying vec2 vTexCoord;

void main() {
    if (useTexture) {
        vec4 texColor = texture2D(textureSampler, vTexCoord);
        gl_FragColor = vec4(texColor.rgb, textureAlpha) * color;
    } else {
        gl_FragColor = color;
    }
}`;
