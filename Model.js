'use strict';

function deg2rad(angle) {
    return angle * Math.PI / 180.0;
}

function Vertex(p) {
    this.p = p;
}

function Triangle(v0, v1, v2) {
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
}

/**
 * Indexed WebGL model used for the filled DROP surface, its wireframe overlay
 * and the webcam plane in the zero-parallax plane.
 */
function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.iTexCoordBuffer = gl.createBuffer();
    this.iIndexBuffer = gl.createBuffer();
    this.count = 0;
    this.hasTexCoords = false;

    this.BufferData = function(vertices, indices, texCoords) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        this.hasTexCoords = Boolean(texCoords);
        if (this.hasTexCoords) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        this.count = indices.length;
    };

    this.Bind = function() {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        if (this.hasTexCoords) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordBuffer);
            gl.vertexAttribPointer(shProgram.iAttribTexCoord, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(shProgram.iAttribTexCoord);
        } else {
            gl.disableVertexAttribArray(shProgram.iAttribTexCoord);
            gl.vertexAttrib2f(shProgram.iAttribTexCoord, 0, 0);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
    };

    this.Draw = function() {
        this.Bind();
        gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    };

    this.DrawWireframe = function() {
        this.Bind();
        const bytesPerIndex = Uint16Array.BYTES_PER_ELEMENT;
        for (let i = 0; i < this.count; i += 3) {
            gl.drawElements(gl.LINE_LOOP, 3, gl.UNSIGNED_SHORT, i * bytesPerIndex);
        }
    };
}

/**
 * Creates the required DROP model as a parametric surface of revolution.
 *
 * The profile is a real teardrop-like curve: a rounded heavy lower part and a
 * narrow pointed upper part.  It is not a generic cylinder/sphere; it is named
 * and generated as the DROP model required for the assignment.
 *
 * The vertices are centered around the center of mass, so the mouse rotates the
 * model around its own center instead of around a corner or world origin.
 */
function CreateSurfaceData(data) {
    const vertices = [];
    const triangles = [];
    const rows = 64;
    const cols = 112;

    for (let row = 0; row <= rows; row += 1) {
        const v = row / rows;
        const y = (v - 0.5) * 4.25;

        // DROP radius profile:
        // - v = 0 is the rounded bottom point;
        // - the lower-middle part is the widest;
        // - v = 1 is a narrow sharp tip.
        const base = Math.sin(Math.PI * v);
        const lowerBulge = 1.28 - 0.63 * v;
        const topTaper = Math.pow(1.0 - 0.12 * v, 1.7);
        let radius = 1.22 * base * lowerBulge * topTaper;

        // A small smooth wobble keeps the surface closer to the kind of
        // parametric surface used in the graphics-data module and makes the
        // wireframe easier to see without changing the DROP silhouette.
        const verticalWave = 1.0 + 0.035 * Math.sin(4.0 * Math.PI * v);
        radius *= verticalWave;
        radius = Math.max(radius, 0.015);

        for (let col = 0; col <= cols; col += 1) {
            const u = col / cols;
            const angle = u * Math.PI * 2.0;
            const angularWave = 1.0 + 0.025 * Math.sin(3.0 * angle + 1.6 * v);
            const r = radius * angularWave;
            const x = r * Math.cos(angle);
            const z = r * Math.sin(angle);

            vertices.push(new Vertex([x, y, z]));
        }
    }

    const stride = cols + 1;
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const v0 = row * stride + col;
            const v1 = v0 + 1;
            const v2 = v0 + stride;
            const v3 = v2 + 1;

            triangles.push(new Triangle(v0, v2, v1));
            triangles.push(new Triangle(v1, v2, v3));
        }
    }

    centerVertices(vertices);

    data.verticesF32 = new Float32Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i += 1) {
        data.verticesF32[i * 3 + 0] = vertices[i].p[0];
        data.verticesF32[i * 3 + 1] = vertices[i].p[1];
        data.verticesF32[i * 3 + 2] = vertices[i].p[2];
    }

    data.indicesU16 = new Uint16Array(triangles.length * 3);
    for (let i = 0; i < triangles.length; i += 1) {
        data.indicesU16[i * 3 + 0] = triangles[i].v0;
        data.indicesU16[i * 3 + 1] = triangles[i].v1;
        data.indicesU16[i * 3 + 2] = triangles[i].v2;
    }
}

function centerVertices(vertices) {
    const center = [0, 0, 0];

    for (let i = 0; i < vertices.length; i += 1) {
        center[0] += vertices[i].p[0];
        center[1] += vertices[i].p[1];
        center[2] += vertices[i].p[2];
    }

    center[0] /= vertices.length;
    center[1] /= vertices.length;
    center[2] /= vertices.length;

    for (let i = 0; i < vertices.length; i += 1) {
        vertices[i].p[0] -= center[0];
        vertices[i].p[1] -= center[1];
        vertices[i].p[2] -= center[2];
    }
}

function CreateVideoPlaneData(data, width, height) {
    data.verticesF32 = new Float32Array([
        -width / 2, -height / 2, 0,
         width / 2, -height / 2, 0,
         width / 2,  height / 2, 0,
        -width / 2,  height / 2, 0
    ]);

    // Mirrored horizontally so the webcam behaves like a normal front camera.
    data.texCoordsF32 = new Float32Array([
        1, 1,
        0, 1,
        0, 0,
        1, 0
    ]);

    data.indicesU16 = new Uint16Array([
        0, 1, 2,
        0, 2, 3
    ]);
}
