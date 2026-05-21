/*
 * Control Task — variant 14.
 * AR.js/A-Frame component that renders the same DROP surface from PA#1/PA#2
 * directly above the custom registration template pattern-14.patt.
 */

AFRAME.registerComponent('drop-surface-14', {
    init: function () {
        const el = this.el;

        const group = new THREE.Group();

        const surfaceData = createDropSurfaceData(64, 112);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(surfaceData.vertices, 3));
        geometry.setIndex(surfaceData.indices);
        geometry.computeVertexNormals();
        normalizeGeometryToUnitSize(geometry, 1.25);

        const solidMaterial = new THREE.MeshPhongMaterial({
            color: 0x31d158,
            transparent: true,
            opacity: 0.48,
            side: THREE.DoubleSide,
            shininess: 45
        });

        const wireMaterial = new THREE.MeshBasicMaterial({
            color: 0x0b3d1b,
            wireframe: true,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide
        });

        const solidMesh = new THREE.Mesh(geometry, solidMaterial);
        const wireMesh = new THREE.Mesh(geometry.clone(), wireMaterial);

        group.add(solidMesh);
        group.add(wireMesh);

        // Small axis marker, similar to the visual marker used in PA#2.
        // It makes the orientation of the DROP surface easier to see in the video.
        const axisMaterial = new THREE.MeshBasicMaterial({ color: 0xff3344 });
        const axisGeometry = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 16);
        const axis = new THREE.Mesh(axisGeometry, axisMaterial);
        axis.position.set(0, -0.05, 0.18);
        group.add(axis);

        // Position the object so that the bottom of the DROP stands on the marker plane.
        group.position.y = 0.62;
        group.rotation.x = 0;

        el.setObject3D('drop-surface', group);
    }
});

function createDropSurfaceData(rows, cols) {
    const vertices = [];
    const indices = [];

    for (let row = 0; row <= rows; row += 1) {
        const v = row / rows;
        const y = (v - 0.5) * 4.25;

        const base = Math.sin(Math.PI * v);
        const lowerBulge = 1.28 - 0.63 * v;
        const topTaper = Math.pow(1.0 - 0.12 * v, 1.7);
        let radius = 1.22 * base * lowerBulge * topTaper;

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
            vertices.push(x, y, z);
        }
    }

    const stride = cols + 1;
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const v0 = row * stride + col;
            const v1 = v0 + 1;
            const v2 = v0 + stride;
            const v3 = v2 + 1;

            indices.push(v0, v2, v1);
            indices.push(v1, v2, v3);
        }
    }

    return { vertices, indices };
}

function normalizeGeometryToUnitSize(geometry, targetSize) {
    geometry.computeBoundingBox();

    const box = geometry.boundingBox;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();

    box.getCenter(center);
    box.getSize(size);

    geometry.translate(-center.x, -center.y, -center.z);

    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = targetSize / maxDimension;
    geometry.scale(scale, scale, scale);

    geometry.computeBoundingBox();
}
