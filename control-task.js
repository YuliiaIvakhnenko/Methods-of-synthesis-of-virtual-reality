'use strict';

(function() {
    const THREE = AFRAME.THREE;

    function createDropGeometry() {
        const positions = [];
        const indices = [];
        const rows = 64;
        const cols = 112;

        for (let row = 0; row <= rows; row += 1) {
            const v = row / rows;
            const y = (v - 0.5) * 4.25;

            // Same DROP surface profile as in PA#1/PA#2.
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

                positions.push(
                    r * Math.cos(angle),
                    y,
                    r * Math.sin(angle)
                );
            }
        }

        centerPositions(positions);

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

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        return geometry;
    }

    function centerPositions(positions) {
        const center = [0, 0, 0];
        const count = positions.length / 3;

        for (let i = 0; i < positions.length; i += 3) {
            center[0] += positions[i];
            center[1] += positions[i + 1];
            center[2] += positions[i + 2];
        }

        center[0] /= count;
        center[1] /= count;
        center[2] /= count;

        for (let i = 0; i < positions.length; i += 3) {
            positions[i] -= center[0];
            positions[i + 1] -= center[1];
            positions[i + 2] -= center[2];
        }
    }

    function createNeedle() {
        const group = new THREE.Group();

        const headShape = new THREE.Shape();
        headShape.moveTo(0.0, 0.72);
        headShape.lineTo(-0.25, 0.2);
        headShape.lineTo(0.25, 0.2);
        headShape.lineTo(0.0, 0.72);

        const headGeometry = new THREE.ShapeGeometry(headShape);
        const headMaterial = new THREE.MeshBasicMaterial({
            color: 0xff3045,
            side: THREE.DoubleSide
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.rotation.x = -Math.PI / 2;
        head.position.set(0, 2.55, 0.92);
        group.add(head);

        const tailGeometry = new THREE.BoxGeometry(0.12, 0.06, 1.35);
        const tailMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
        const tail = new THREE.Mesh(tailGeometry, tailMaterial);
        tail.position.set(0, 2.56, 0.0);
        group.add(tail);

        return group;
    }

    AFRAME.registerComponent('drop-surface', {
        init: function() {
            const group = new THREE.Group();
            const geometry = createDropGeometry();

            const surfaceMaterial = new THREE.MeshStandardMaterial({
                color: 0xf8fafc,
                roughness: 0.46,
                metalness: 0.16,
                side: THREE.DoubleSide
            });

            const surface = new THREE.Mesh(geometry, surfaceMaterial);
            surface.castShadow = true;
            surface.receiveShadow = true;
            group.add(surface);

            const wireframe = new THREE.LineSegments(
                new THREE.WireframeGeometry(geometry),
                new THREE.LineBasicMaterial({
                    color: 0x0ea5e9,
                    transparent: true,
                    opacity: 0.55
                })
            );
            group.add(wireframe);

            group.add(createNeedle());

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
            group.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.95);
            directionalLight.position.set(2.2, 3.4, 2.5);
            group.add(directionalLight);

            this.el.setObject3D('dropSurface', group);
        }
    });

    window.addEventListener('load', function() {
        const marker = document.getElementById('variantMarker');
        const status = document.getElementById('trackingStatus');

        if (!marker || !status) {
            return;
        }

        marker.addEventListener('markerFound', function() {
            status.textContent = 'Marker found: DROP surface is aligned to template 14.';
            status.classList.add('ok');
        });

        marker.addEventListener('markerLost', function() {
            status.textContent = 'Searching for marker...';
            status.classList.remove('ok');
        });
    });
}());
