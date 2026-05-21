'use strict';

(function() {
    const THREE = AFRAME.THREE;

    function createDropGeometry() {
        const positions = [];
        const indices = [];
        const rows = 72;
        const cols = 120;

        for (let row = 0; row <= rows; row += 1) {
            const v = row / rows;
            const y = (v - 0.5) * 4.25;

            // DROP surface profile from PA#1/PA#2.
            // The radius is larger in the lower part and gradually narrows to the top.
            const base = Math.sin(Math.PI * v);
            const lowerBulge = 1.32 - 0.66 * v;
            const topTaper = Math.pow(1.0 - 0.10 * v, 1.7);
            let radius = 1.20 * base * lowerBulge * topTaper;

            const verticalWave = 1.0 + 0.035 * Math.sin(4.0 * Math.PI * v);
            radius *= verticalWave;
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

    function createCompassNeedle() {
        const group = new THREE.Group();

        const needleGeometry = new THREE.ConeGeometry(0.13, 0.70, 32);
        const needleMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
        const needle = new THREE.Mesh(needleGeometry, needleMaterial);
        needle.position.set(0, 2.55, 0);
        needle.rotation.x = Math.PI;
        needle.renderOrder = 8;
        group.add(needle);

        const centerGeometry = new THREE.SphereGeometry(0.13, 24, 16);
        const centerMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
        const center = new THREE.Mesh(centerGeometry, centerMaterial);
        center.position.set(0, 0, 0);
        center.renderOrder = 8;
        group.add(center);

        return group;
    }

    function makeCameraVideoVisible() {
        const scene = document.querySelector('a-scene');

        function applyRendererTransparency() {
            if (scene && scene.renderer) {
                scene.renderer.setClearColor(new THREE.Color(0x000000), 0);
                if (scene.renderer.setClearAlpha) {
                    scene.renderer.setClearAlpha(0);
                }
            }
        }

        function applyVideoStyles() {
            const videos = document.querySelectorAll('video, #arjs-video, .arjs-video');
            videos.forEach(function(video) {
                video.style.position = 'fixed';
                video.style.top = '0';
                video.style.left = '0';
                video.style.right = '0';
                video.style.bottom = '0';
                video.style.width = '100vw';
                video.style.height = '100vh';
                video.style.minWidth = '100vw';
                video.style.minHeight = '100vh';
                video.style.objectFit = 'cover';
                video.style.display = 'block';
                video.style.visibility = 'visible';
                video.style.opacity = '1';
                video.style.zIndex = '0';
                video.style.background = 'transparent';
            });
        }

        applyRendererTransparency();
        applyVideoStyles();

        if (scene) {
            scene.addEventListener('loaded', applyRendererTransparency);
            scene.addEventListener('renderstart', applyRendererTransparency);
        }

        [200, 500, 900, 1500, 2500, 4000].forEach(function(delay) {
            window.setTimeout(function() {
                applyRendererTransparency();
                applyVideoStyles();
            }, delay);
        });
    }

    AFRAME.registerComponent('drop-surface', {
        init: function() {
            const group = new THREE.Group();
            const geometry = createDropGeometry();

            // Do NOT rotate the group onto the marker plane: the DROP should stand above
            // the marker, like a visible AR object, not lie flat as a circle.
            group.rotation.set(0, 0, 0);

            const surfaceMaterial = new THREE.MeshBasicMaterial({
                color: 0x22c55e,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.48,
                depthTest: false
            });

            const surface = new THREE.Mesh(geometry, surfaceMaterial);
            surface.renderOrder = 5;
            group.add(surface);

            const wireframe = new THREE.LineSegments(
                new THREE.WireframeGeometry(geometry),
                new THREE.LineBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: false
                })
            );
            wireframe.renderOrder = 6;
            group.add(wireframe);

            const cyanOutline = new THREE.LineSegments(
                new THREE.WireframeGeometry(geometry),
                new THREE.LineBasicMaterial({
                    color: 0x38bdf8,
                    transparent: true,
                    opacity: 0.75,
                    depthTest: false
                })
            );
            cyanOutline.scale.set(1.02, 1.02, 1.02);
            cyanOutline.renderOrder = 7;
            group.add(cyanOutline);

            group.add(createCompassNeedle());

            this.el.setObject3D('dropSurface', group);
        },

        tick: function(time) {
            const object = this.el.getObject3D('dropSurface');
            if (object) {
                object.rotation.y = time * 0.00035;
            }
        }
    });

    window.addEventListener('load', function() {
        makeCameraVideoVisible();

        const marker = document.getElementById('variantMarker');
        const status = document.getElementById('trackingStatus');

        if (!marker || !status) {
            return;
        }

        marker.addEventListener('markerFound', function() {
            status.textContent = 'Marker found: green DROP surface is aligned to template 14.';
            status.classList.add('ok');
            makeCameraVideoVisible();
        });

        marker.addEventListener('markerLost', function() {
            status.textContent = 'Searching for marker...';
            status.classList.remove('ok');
            makeCameraVideoVisible();
        });
    });
}());
