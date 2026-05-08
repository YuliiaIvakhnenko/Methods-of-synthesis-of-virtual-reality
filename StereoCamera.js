'use strict';

/**
 * Off-axis stereo camera for anaglyph rendering.
 *
 * The formulas are a direct WebGL migration of the OpenGL glFrustum-based
 * code from the assignment.  The convergence plane is the zero-parallax plane:
 * objects placed at distance = convergence overlap for the left and right eye.
 */
function StereoCamera(
    convergence,
    eyeSeparation,
    aspectRatio,
    fovDegrees,
    nearClippingDistance,
    farClippingDistance
) {
    this.convergence = convergence;
    this.eyeSeparation = eyeSeparation;
    this.aspectRatio = aspectRatio;
    this.fovDegrees = fovDegrees;
    this.nearClippingDistance = nearClippingDistance;
    this.farClippingDistance = farClippingDistance;

    this.setAspectRatio = function(aspectRatio) {
        this.aspectRatio = aspectRatio;
    };

    this.update = function(settings) {
        this.convergence = settings.convergence;
        this.eyeSeparation = settings.eyeSeparation;
        this.fovDegrees = settings.fovDegrees;
        this.nearClippingDistance = settings.nearClippingDistance;
        this.farClippingDistance = settings.farClippingDistance;
    };

    this.fovRadians = function() {
        return this.fovDegrees * Math.PI / 180.0;
    };

    this.calcLeftFrustum = function() {
        const top = this.nearClippingDistance * Math.tan(this.fovRadians() / 2.0);
        const bottom = -top;
        const a = this.aspectRatio * Math.tan(this.fovRadians() / 2.0) * this.convergence;
        const b = a - this.eyeSeparation / 2.0;
        const c = a + this.eyeSeparation / 2.0;
        const left = -b * this.nearClippingDistance / this.convergence;
        const right = c * this.nearClippingDistance / this.convergence;

        return m4.frustum(
            left,
            right,
            bottom,
            top,
            this.nearClippingDistance,
            this.farClippingDistance
        );
    };

    this.calcRightFrustum = function() {
        const top = this.nearClippingDistance * Math.tan(this.fovRadians() / 2.0);
        const bottom = -top;
        const a = this.aspectRatio * Math.tan(this.fovRadians() / 2.0) * this.convergence;
        const b = a - this.eyeSeparation / 2.0;
        const c = a + this.eyeSeparation / 2.0;
        const left = -c * this.nearClippingDistance / this.convergence;
        const right = b * this.nearClippingDistance / this.convergence;

        return m4.frustum(
            left,
            right,
            bottom,
            top,
            this.nearClippingDistance,
            this.farClippingDistance
        );
    };

    this.calcLeftEyeModelView = function(baseModelView) {
        return m4.multiply(m4.translation(this.eyeSeparation / 2.0, 0, 0), baseModelView);
    };

    this.calcRightEyeModelView = function(baseModelView) {
        return m4.multiply(m4.translation(-this.eyeSeparation / 2.0, 0, 0), baseModelView);
    };
}
