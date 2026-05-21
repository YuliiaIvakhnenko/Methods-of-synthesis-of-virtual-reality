'use strict';

(function() {
    AFRAME.registerComponent('drop-surface', {
        init: function() {
            const THREE = AFRAME.THREE;
            const geometry = createDropGeometry(THREE);

            const group = new THREE.Group();
            group.frustumCulled = false;

            const bodyMaterial = new THREE.MeshPhongMaterial({
                color: 0x22c55e,
                transparent: true,
                opacity: 0.55,
                side: THREE.DoubleSide,
                depthTest: true
            });

            const body = new THREE.Mesh(geometry, bodyMaterial);
            body.frustumCulled = false;
            group.add(body);

            const wire = new THREE.LineSegments(
                new THREE.WireframeGeometry(geometry),
                new THREE.LineBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.90,
                    depthTest: true
                })
            );
            wire.frustumCulled = false;
            group.add(wire);

            const outline = new THREE.LineSegments(
                new THREE.WireframeGeometry(geometry),
                new THREE.LineBasicMaterial({
                    color: 0x38bdf8,
                    transparent: true,
                    opacity: 0.70,
                    depthTest: true
                })
            );
            outline.scale.set(1.025, 1.025, 1.025);
            outline.frustumCulled = false;
            group.add(outline);

            const light = new THREE.DirectionalLight(0xffffff, 0.9);
            light.position.set(0.6, 1.0, 0.8);
            group.add(light);

            const ambient = new THREE.AmbientLight(0xffffff, 0.7);
            group.add(ambient);

            this.el.setObject3D('dropSurface', group);
        }
    });

    function createDropGeometry(THREE) {
        const positions = [];
        const indices = [];
        const rows = 72;
        const cols = 120;

        for (let row = 0; row <= rows; row += 1) {
            const v = row / rows;
            const y = (v - 0.5) * 4.25;

            const base = Math.sin(Math.PI * v);
            const lowerBulge = 1.32 - 0.66 * v;
            const topTaper = Math.pow(1.0 - 0.10 * v, 1.7);
            let radius = 1.20 * base * lowerBulge * topTaper;
            radius *= 1.0 + 0.035 * Math.sin(4.0 * Math.PI * v);
            radius = Math.max(radius, 0.012);

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
        normalizeGeometry(THREE, geometry, 0.95);
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        return geometry;
    }

    function normalizeGeometry(THREE, geometry, targetSize) {
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();

        geometry.boundingBox.getCenter(center);
        geometry.boundingBox.getSize(size);

        const maxDimension = Math.max(size.x, size.y, size.z);
        const scale = targetSize / maxDimension;

        geometry.translate(-center.x, -center.y, -center.z);
        geometry.scale(scale, scale, scale);
    }

    function forceFullCameraView() {
        const scene = document.querySelector('a-scene');
        if (scene && scene.renderer) {
            scene.renderer.setClearColor(new AFRAME.THREE.Color(0x000000), 0);
            if (scene.renderer.setClearAlpha) {
                scene.renderer.setClearAlpha(0);
            }
        }

        const viewportWidth = window.innerWidth + 'px';
        const viewportHeight = window.innerHeight + 'px';

        document.querySelectorAll('video, #arjs-video, .arjs-video, canvas, .a-canvas, a-scene')
            .forEach(function(element) {
                element.style.position = 'fixed';
                element.style.width = viewportWidth;
                element.style.height = viewportHeight;
                element.style.minWidth = viewportWidth;
                element.style.minHeight = viewportHeight;
            });

        document.querySelectorAll('video, #arjs-video, .arjs-video').forEach(function(video) {
            video.style.top = '50%';
            video.style.left = '50%';
            video.style.transform = 'translate(-50%, -50%)';
            video.style.objectFit = 'cover';
            video.style.objectPosition = 'center center';
            video.style.display = 'block';
            video.style.visibility = 'visible';
            video.style.opacity = '1';
            video.style.zIndex = '0';
        });
    }

    window.addEventListener('load', function() {
        const marker = document.getElementById('variantMarker');
        const status = document.getElementById('trackingStatus');

        function setStatus(text, found) {
            if (!status) {
                return;
            }

            status.textContent = text;
            status.classList.toggle('ok', found);
        }

        if (marker) {
            marker.addEventListener('markerFound', function() {
                setStatus('Marker found: DROP surface is aligned to template 14.', true);
                forceFullCameraView();
            });

            marker.addEventListener('markerLost', function() {
                setStatus('Searching for marker...', false);
                forceFullCameraView();
            });
        }

        forceFullCameraView();
        [250, 600, 1000, 1800, 3000, 5000].forEach(function(delay) {
            window.setTimeout(forceFullCameraView, delay);
        });

        window.addEventListener('resize', forceFullCameraView);
        window.addEventListener('orientationchange', function() {
            window.setTimeout(forceFullCameraView, 300);
        });
    });
}());
