////////////////////////////////////////////////////////////////////////////////
//                      First Person Character Controller                     //
////////////////////////////////////////////////////////////////////////////////
var CharacterController = pc.createScript('characterController');

CharacterController.attributes.add('speed', { type: 'number', default: 10 });
CharacterController.attributes.add('jumpImpulse', { type: 'number', default: 12 });

// initialize code called once per entity
CharacterController.prototype.initialize = function () {
    this.groundCheckRay = new pc.Vec3(0, -0.5, 0);
    this.rayEnd = new pc.Vec3();

    this.groundNormal = new pc.Vec3();
    this.onGround = true;
    this.jumping = false;
};

CharacterController.prototype.move = function (direction) {
    if (this.onGround && !this.jumping) {
        var tmp = new pc.Vec3();

        var length = direction.length();
        if (length > 0) {
            // calculate new forward vec parallel to the current ground surface
            tmp.cross(this.groundNormal, direction).cross(tmp, this.groundNormal);
            tmp.normalize().scale(length * this.speed);
        }
        this.entity.rigidbody.linearVelocity = tmp;
    }
};

CharacterController.prototype.jump = function () {
    if (this.onGround && !this.jumping) {
        this.entity.rigidbody.applyImpulse(0, this.jumpImpulse, 0);
        this.onGround = false;
        this.jumping = true;
        setTimeout(function () {
            this.jumping = false;
        }.bind(this), 500);
    }
};

// update code called every frame
CharacterController.prototype.update = function (dt) {
    var pos = this.entity.getPosition();
    this.rayEnd.add2(pos, this.groundCheckRay);

    // Fire a ray straight down to just below the bottom of the rigid body,
    // if it hits something then the character is standing on something.
    var result = this.app.systems.rigidbody.raycastFirst(pos, this.rayEnd);
    this.onGround = !!result;
    if (result) {
        this.groundNormal.copy(result.normal);
    }
};


////////////////////////////////////////////////////////////////////////////////
//         First Person Controls That Drive a Character Controller            //
////////////////////////////////////////////////////////////////////////////////
var FirstPersonCamera = pc.createScript('firstPersonCamera');

FirstPersonCamera.attributes.add('camera', {
    title: 'Camera',
    description: 'The camera controlled by this first person view. It should be a child of the entity to which this script is assigned. If no camera is assigned, the script will create one for you.',
    type: 'entity'
});

FirstPersonCamera.prototype.initialize = function () {
    var app = this.app;

    // Check the user has set a camera entity for the FPS view
    if (!this.camera) {
        // If not look for a chile of the character controller called 'Camera'
        this.camera = this.entity.findByName('Camera');
        if (!this.camera) {
            // Still don't have a camera so just create one!
            this.camera = new pc.Entity('FPS Camera');
            this.camera.addComponent('camera');
        }
    }

    this.x = new pc.Vec3();
    this.z = new pc.Vec3();
    this.heading = new pc.Vec3();
    this.magnitude = new pc.Vec2();

    this.azimuth = 0;
    this.elevation = 0;

    // Calculate camera azimuth/elevation
    var temp = this.camera.forward.clone();
    temp.y = 0;
    temp.normalize();
    this.azimuth = Math.atan2(-temp.x, -temp.z) * (180 / Math.PI);

    var rot = new pc.Mat4().setFromAxisAngle(pc.Vec3.UP, -this.azimuth);
    rot.transformVector(this.camera.forward, temp);
    this.elevation = Math.atan(temp.y, temp.z) * (180 / Math.PI);

    this.forward = 0;
    this.strafe = 0;
    this.jump = false;
    this.cnt = 0;

    app.on('firstperson:forward', function (value) {
        this.forward = value;
    }, this);
    app.on('firstperson:strafe', function (value) {
        this.strafe = value;
    }, this);
    app.on('firstperson:look', function (azimuthDelta, elevationDelta) {
        this.azimuth += azimuthDelta;
        this.elevation += elevationDelta;
        this.elevation = pc.math.clamp(this.elevation, -90, 90);
    }, this);
    app.on('firstperson:jump', function () {
        this.jump = true;
    }, this);
};

FirstPersonCamera.prototype.postUpdate = function (dt) {
    // Update the camera's orientation
    this.camera.setEulerAngles(this.elevation, this.azimuth, 0);

    // Calculate the camera's heading in the XZ plane
    this.z.copy(this.camera.forward);
    this.z.y = 0;
    this.z.normalize();

    this.x.copy(this.camera.right);
    this.x.y = 0;
    this.x.normalize();

    this.heading.set(0, 0, 0);

    // Move forwards/backwards
    if (this.forward !== 0) {
        this.z.scale(this.forward);
        this.heading.add(this.z);
    }

    // Strafe left/right
    if (this.strafe !== 0) {
        this.x.scale(this.strafe);
        this.heading.add(this.x);
    }

    if (this.heading.length() > 0.0001) {
        this.magnitude.set(this.forward, this.strafe);
        this.heading.normalize().scale(this.magnitude.length());
    }

    if (this.jump) {
        this.entity.script.characterController.jump();
        this.jump = false;
    }

    this.entity.script.characterController.move(this.heading);

    var pos = this.camera.getPosition();
    this.app.fire('cameramove', pos);
};


// Utility function for both touch and gamepad handling of deadzones
// Takes a 2-axis joystick position in the range -1 to 1 and applies
// an upper and lower radial deadzone, remapping values in the legal
// range from 0 to 1.
function applyRadialDeadZone(pos, remappedPos, deadZoneLow, deadZoneHigh) {
    var magnitude = pos.length();

    if (magnitude > deadZoneLow) {
        var legalRange = 1 - deadZoneHigh - deadZoneLow;
        var normalizedMag = Math.min(1, (magnitude - deadZoneLow) / legalRange);
        var scale = normalizedMag / magnitude;
        remappedPos.copy(pos).scale(scale);
    } else {
        remappedPos.set(0, 0);
    }
}

////////////////////////////////////////////////////////////////////////////////
//                 Virtual Touch Pad FPS Touch Controls                      //
////////////////////////////////////////////////////////////////////////////////
var TouchInput = pc.createScript('touchInput');

TouchInput.attributes.add('deadZone', {
    title: 'Dead Zone',
    description: 'Radial thickness of inner dead zone of the virtual joysticks. This dead zone ensures the virtual joysticks report a value of 0 even if a touch deviates a small amount from the initial touch.',
    type: 'number',
    min: 0,
    max: 0.4,
    default: 0.3
});
TouchInput.attributes.add('turnSpeed', {
    title: 'Turn Speed',
    description: 'Maximum turn speed in degrees per second',
    type: 'number',
    default: 150
});
TouchInput.attributes.add('radius', {
    title: 'Radius',
    description: 'The radius of the virtual joystick in CSS pixels.',
    type: 'number',
    default: 50
});
TouchInput.attributes.add('doubleTapInterval', {
    title: 'Double Tap Interval',
    description: 'The time in milliseconds between two taps of the right virtual joystick for a double tap to register. A double tap will trigger a jump.',
    type: 'number',
    default: 300
});

TouchInput.prototype.initialize = function () {
    var app = this.app;
    var graphicsDevice = app.graphicsDevice;
    var canvas = graphicsDevice.canvas;

    this.remappedPos = new pc.Vec2();

    this.leftStick = {
        identifier: -1,
        center: new pc.Vec2(),
        pos: new pc.Vec2()
    };
    this.rightTouch = {
        identifier: -1,
        pos: new pc.Vec2(),
    };

    this.lastRightTap = 0;

    var touchStart = function (e) {
        e.preventDefault();

        var xFactor = graphicsDevice.width / canvas.clientWidth;
        var yFactor = graphicsDevice.height / canvas.clientHeight;

        var touches = e.changedTouches;
        for (var i = 0; i < touches.length; i++) {
            var touch = touches[i];

            if (touch.pageX <= canvas.clientWidth / 2 && this.leftStick.identifier === -1) {
                // If the user touches the left half of the screen, create a left virtual joystick...
                this.leftStick.identifier = touch.identifier;
                this.leftStick.center.set(touch.pageX, touch.pageY);
                this.leftStick.pos.set(0, 0);
                app.fire('leftjoystick:enable', touch.pageX * xFactor, touch.pageY * yFactor);
            } else if (touch.pageX > canvas.clientWidth / 2 && this.rightTouch.identifier === -1) {
                // ...otherwise create a right virtual joystick
                this.rightTouch.identifier = touch.identifier;
                this.rightTouch.pos.set(touch.pageX, touch.pageY);
                app.fire('rightjoystick:enable', touch.pageX * xFactor, touch.pageY * yFactor);

                // See how long since the last tap of the right virtual joystick to detect a double tap (jump)
                var now = Date.now();
                if (now - this.lastRightTap < this.doubleTapInterval) {
                    app.fire('firstperson:jump');
                }
                this.lastRightTap = now;
            }
        }
    }.bind(this);

    var touchMove = function (e) {
        e.preventDefault();

        var xFactor = graphicsDevice.width / canvas.clientWidth;
        var yFactor = graphicsDevice.height / canvas.clientHeight;

        var touches = e.changedTouches;
        for (var i = 0; i < touches.length; i++) {
            var touch = touches[i];

            // Update the current positions of the two virtual joysticks
            if (touch.identifier === this.leftStick.identifier) {
                this.leftStick.pos.set(touch.pageX, touch.pageY);
                this.leftStick.pos.sub(this.leftStick.center);
                this.leftStick.pos.scale(1 / this.radius);
                app.fire('leftjoystick:move', touch.pageX * xFactor, touch.pageY * yFactor);
            } else if (touch.identifier === this.rightTouch.identifier) {
                app.fire('rightjoystick:move', touch.pageX * xFactor, touch.pageY * yFactor);

                var lookLeftRight = -(touch.pageX - this.rightTouch.pos.x) * this.turnSpeed / 500;
                var lookUpDown = -(touch.pageY - this.rightTouch.pos.y) * this.turnSpeed / 500;
                
                app.fire('firstperson:look', lookLeftRight, lookUpDown);
                this.rightTouch.pos.set(touch.pageX, touch.pageY);
            }
        }
    }.bind(this);

    var touchEnd = function (e) {
        e.preventDefault();

        var touches = e.changedTouches;
        for (var i = 0; i < touches.length; i++) {
            var touch = touches[i];

            // If this touch is one of the sticks, get rid of it...
            if (touch.identifier === this.leftStick.identifier) {
                this.leftStick.identifier = -1;
                app.fire('firstperson:forward', 0);
                app.fire('firstperson:strafe', 0);
                app.fire('leftjoystick:disable');
            } else if (touch.identifier === this.rightTouch.identifier) {
                this.rightTouch.identifier = -1;
                app.fire('rightjoystick:disable');
            }
        }
    }.bind(this);

    // Manage DOM event listeners
    var addEventListeners = function () {
        canvas.addEventListener('touchstart', touchStart, false);
        canvas.addEventListener('touchmove', touchMove, false);
        canvas.addEventListener('touchend', touchEnd, false);
    };
    var removeEventListeners = function () {
        canvas.removeEventListener('touchstart', touchStart, false);
        canvas.removeEventListener('touchmove', touchMove, false);
        canvas.removeEventListener('touchend', touchEnd, false);
    };

    this.on('enable', addEventListeners);
    this.on('disable', removeEventListeners);

    addEventListeners();
};

TouchInput.prototype.update = function (dt) {
    var app = this.app;

    // Moving
    if (this.leftStick.identifier !== -1) {
        // Apply a lower radial dead zone. We don't need an upper zone like with a real joypad
        applyRadialDeadZone(this.leftStick.pos, this.remappedPos, this.deadZone, 0);

        var strafe = this.remappedPos.x;
        if (this.lastStrafe !== strafe) {
            app.fire('firstperson:strafe', strafe);
            this.lastStrafe = strafe;
        }
        var forward = -this.remappedPos.y;
        if (this.lastForward !== forward) {
            app.fire('firstperson:forward', forward);
            this.lastForward = forward;
        }
    }
};