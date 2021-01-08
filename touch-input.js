var TouchInput = pc.createScript('touchInput');

TouchInput.attributes.add('camera', {
    type: 'entity',
    title: 'Camera Entity',
    description: 'Camera to control'
});

TouchInput.attributes.add('lookSensitivity', {
    type: 'number',
    default: 0.7,
    title: 'Look Sensitivity',
    description: 'How fast the camera looks around. Higher is faster'
});

TouchInput.attributes.add('movementSensitivity', {
    type: 'number',
    default: 1000,
    title: 'Movement Sensitivity',
    description: 'How fast the player moves. Higher is faster'
});

TouchInput.attributes.add('player', {
    type: 'entity',
    title: 'Player Entity',
    description: 'Entity to control'
});

TouchInput.attributes.add('jumpBtn', {
    type: 'entity',
    title: 'Jump Button Entity',
    description: 'Button to jump'
});

TouchInput.attributes.add('shootBtn', {
    type: 'entity',
    title: 'Shoot Button Entity',
    description: 'Button to shoot'
});


TouchInput.prototype.initialize = function() {
    this.red = new pc.StandardMaterial();
    this.red.diffuse.set(1, 0, 0);
    this.red.update();

    this.azimuth = 0;
    this.elevation = 0;

    var temp = this.camera.forward.clone();
    temp.y = 0;
    temp.normalize();
    this.azimuth = Math.atan2(-temp.x, -temp.z) * (180 / Math.PI);

    this.elevation = Math.atan(temp.y, temp.z) * (180 / Math.PI);

    this.player.collision.on('collisionstart', this.onCollisionStart, this);

    this.lastRTouchPoint = new pc.Vec2();
    this.lastLTouchPoint = new pc.Vec2();
    this.LTouchStartPoint = new pc.Vec2();

    this.Lid = -1;
    this.Rid = -1;

    this.LTouch;
    this.RTouch;

    this.velX;
    this.velZ;
    this.movementSensitivity = 1;
    this.Force = new pc.Vec3();
    this.forceX = new pc.Vec3();
    this.forceZ = new pc.Vec3();

    this.groundCheckRay = new pc.Vec3(0, -1.2, 0);
    this.rayEnd = new pc.Vec3();

    this.canJump = false;
    this.jumpImpulse = new pc.Vec3(0, 10, 0);
    this.lastJump = 0;


    this.app.touch.on(pc.EVENT_TOUCHSTART, this.onTouchStart, this);
    this.app.touch.on(pc.EVENT_TOUCHEND, this.onTouchEndCancel, this);
    this.app.touch.on(pc.EVENT_TOUCHCANCEL, this.onTouchEndCancel, this);
    this.app.touch.on(pc.EVENT_TOUCHMOVE, this.onTouchMove, this);

    this.on('destroy', function() {
        this.app.touch.off(pc.EVENT_TOUCHSTART, this.onTouchStart, this);
        this.app.touch.off(pc.EVENT_TOUCHEND, this.onTouchEndCancel, this);
        this.app.touch.off(pc.EVENT_TOUCHCANCEL, this.onTouchEndCancel, this);

        this.app.touch.off(pc.EVENT_TOUCHMOVE, this.onTouchMove, this);
    });


    this.shootBtn.button.on('touchstart', function(e) {
        this.shoot();
        var self = this;
        //this.shootInterval = setInterval(this.shoot.bind(this), 200);
    }.bind(this));

    this.shootBtn.button.on('touchend', function(e) {
        //clearInterval(this.shootInterval);
    }.bind(this));


    this.jumpBtn.button.on('touchstart', function(e) {
        var start = this.player.getPosition();
        var end = start.clone();
        end.y -= 1;
        var result = this.app.systems.rigidbody.raycastFirst(start, end);
        if (result != null || (this.canJump == true && this.player.rigidbody.linearVelocity.y >= 0)) {
            this.player.rigidbody.applyImpulse(this.jumpImpulse);
            this.canJump = false;
        }
    }.bind(this));
};


TouchInput.prototype.onCollisionStart = function(event) {
    for (i = 0; i < event.contacts.length; i++) {
        if (event.contacts[i].normal.y == 1 || event.contacts[i].normal.y == -1)
            this.canJump = true;
    }
};


TouchInput.prototype.onTouchStart = function(event) {

    event.changedTouches.forEach(function(touch) {
        if (touch.x >= this.app.graphicsDevice.canvas.width / 2 && this.Rid == -1) {
            this.Rid = touch.id;
            this.lastRTouchPoint.set(touch.x, touch.y);
        }
        else if (touch.x < this.app.graphicsDevice.canvas.width / 2 && this.Lid == -1) {
            this.Lid = touch.id;
            this.LTouchStartPoint.set(touch.x, touch.y);
            this.lastLTouchPoint.set(touch.x, touch.y);
        }
    }, this);

};

TouchInput.prototype.onTouchEndCancel = function(event) {

    event.changedTouches.forEach(function(touch) {
        if (touch.id == this.Rid) {
            this.Rid = -1;
        }
        if (touch.id == this.Lid) {
            this.Lid = -1;
        }
    }, this);

};

TouchInput.fromWorldPoint = new pc.Vec3();
TouchInput.toWorldPoint = new pc.Vec3();
TouchInput.worldDiff = new pc.Vec3();

TouchInput.prototype.onTouchMove = function(event) {

    this.RTouch = event.getTouchById(this.Rid, event.touches);
    if (this.RTouch) {
        this.azimuth -= (this.RTouch.x - this.lastRTouchPoint.x) * this.lookSensitivity;
        this.elevation -= (this.RTouch.y - this.lastRTouchPoint.y) * this.lookSensitivity;
        this.elevation = pc.math.clamp(this.elevation, -90, 90);
        this.camera.setEulerAngles(this.elevation, this.azimuth, 0);

        this.lastRTouchPoint.set(this.RTouch.x, this.RTouch.y);
    }

    this.LTouch = event.getTouchById(this.Lid, event.touches);
    if (this.LTouch) {
        this.lastLTouchPoint.set(this.LTouch.x, this.LTouch.y);
    }

};

TouchInput.prototype.update = function(dt) {

    this.entity.setLocalEulerAngles(0, this.azimuth, 0);


    if (this.Lid != -1) {

        this.velZ = (this.lastLTouchPoint.y - this.LTouchStartPoint.y) * this.movementSensitivity;
        this.velX = (this.lastLTouchPoint.x - this.LTouchStartPoint.x) * this.movementSensitivity;

        this.Force = new pc.Vec3();

        this.forceX.copy(this.entity.right).scale(this.velX);
        this.forceZ.copy(this.entity.forward).scale(-this.velZ);

        this.Force.add2(this.forceX, this.forceZ).normalize().scale(40);

        this.player.rigidbody.applyForce(this.Force);
    }

    var dampingForceX = -4 * this.player.rigidbody.linearVelocity.x ^ dt;
    var dampingForceZ = -4 * this.player.rigidbody.linearVelocity.z ^ dt;

    this.dampingForce = new pc.Vec3(dampingForceX, 0, dampingForceZ);

    this.player.rigidbody.applyForce(this.dampingForce);
};


TouchInput.prototype.shoot = function() {
    console.log("shooting");

    var screenCenterX = (this.app.graphicsDevice.width / 2);
    var screenCenterY = (this.app.graphicsDevice.height / 2);

    var from = this.camera.camera.screenToWorld(screenCenterX, screenCenterY, this.camera.camera.nearClip);
    var to = this.camera.camera.screenToWorld(screenCenterX, screenCenterY, this.camera.camera.farClip);


    var results = this.app.systems.rigidbody.raycastAll(from, to);
    //var result = this.app.systems.rigidbody.raycastFirst(from, to);

    if (results.length > 0) {
        var temp = results;

        results.sort(function(a, b) {
            var a1 = a.point.distance(from);
            var a2 = b.point.distance(from);
            return a1 - a2
        });

        result = results[0];
        if (results[0].entity.name == "characterController")
            result = results[1];
        else
            result = results[0];

        var pos = result.point;

        var entity = new pc.Entity("Box");
        entity.name = "Cube";

        entity.addComponent("model", {
            type: 'box',
        });
        entity.addComponent("collision", {
            type: 'box',
        });
        entity.addComponent("rigidbody", {
            type: pc.BODYTYPE_STATIC,
        });
        entity.setLocalPosition(
            pos.x,
            pos.y,
            pos.z
        );
        entity.model.meshInstances[0].material = this.red;

        this.app.root.addChild(entity);
    }
};