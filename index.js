const {
    Cartesian3,
    Cartesian4,
    Cartographic,
    Color,
    EllipsoidGeodesic,
    HeadingPitchRange,
    Matrix3,
    Matrix4,
    Quaternion,
    Rectangle,
    Transforms,
    Viewer
} = window.Cesium;
const CesiumMath = window.Cesium.Math;

const scratchLookAtHeadingPitchRangeOffset = new Cartesian3();
const scratchLookAtHeadingPitchRangeQuaternion1 = new Quaternion();
const scratchLookAtHeadingPitchRangeQuaternion2 = new Quaternion();
const scratchHeadingPitchRangeMatrix3 = new Matrix3();

const scratchflyToBoundingSphereDirection = new Cartesian3();
const scratchflyToBoundingSphereUp = new Cartesian3();
const scratchflyToBoundingSphereRight = new Cartesian3();
const scratchFlyToBoundingSphereCart4 = new Cartesian4();
const scratchFlyToBoundingSphereQuaternion = new Quaternion();
const scratchFlyToBoundingSphereMatrix3 = new Matrix3();

function main() {
    const viewer = new Viewer("cesiumContainer");

    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;

    const subsurfaceData = {
        rectangle: {
            west: -106.708205618,
            south: 46.474605807,
            east: -101.199005618,
            north: 49.156605807
        },
        minimumTerrainHeight: -9006.2236328125,
        maximumTerrainHeight: -3173.1181640625,
        terrainExaggeration: 8.0,
        terrainExaggerationRelativeHeight: -100000
    };

    function offsetFromHeadingPitchRange(heading, pitch, range) {
        pitch = CesiumMath.clamp(pitch, -CesiumMath.PI_OVER_TWO, CesiumMath.PI_OVER_TWO);
        heading = CesiumMath.zeroToTwoPi(heading) - CesiumMath.PI_OVER_TWO;

        const pitchQuat = Quaternion.fromAxisAngle(
            Cartesian3.UNIT_Y,
            -pitch,
            scratchLookAtHeadingPitchRangeQuaternion1
        );
        const headingQuat = Quaternion.fromAxisAngle(
            Cartesian3.UNIT_Z,
            -heading,
            scratchLookAtHeadingPitchRangeQuaternion2
        );
        const rotQuat = Quaternion.multiply(headingQuat, pitchQuat, headingQuat);
        const rotMatrix = Matrix3.fromQuaternion(rotQuat, scratchHeadingPitchRangeMatrix3);

        const offset = Cartesian3.clone(Cartesian3.UNIT_X, scratchLookAtHeadingPitchRangeOffset);
        Matrix3.multiplyByVector(rotMatrix, offset, offset);
        Cartesian3.negate(offset, offset);
        Cartesian3.multiplyByScalar(offset, range, offset);
        return offset;
    }

    function flyToSubsurface(subsurfaceData) {
        const rectangle = subsurfaceData.rectangle;

        const west = rectangle.west;
        const east = rectangle.east;
        const north = rectangle.north;
        const south = rectangle.south;

        const minimumTerrainHeight = subsurfaceData.minimumTerrainHeight;
        const terrainExaggerationRelativeHeight = subsurfaceData.terrainExaggerationRelativeHeight;
        const terrainExaggeration = subsurfaceData.terrainExaggeration;

        function exaggeratedSubsurfaceHeight(
            height,
            minimumTerrainHeight,
            terrainExaggerationRelativeHeight,
            terrainExaggeration
        ) {
            return (height - minimumTerrainHeight) * terrainExaggeration + terrainExaggerationRelativeHeight;
        }

        const minimumHeight = exaggeratedSubsurfaceHeight(
            minimumTerrainHeight,
            minimumTerrainHeight,
            terrainExaggerationRelativeHeight,
            terrainExaggeration
        );

        const height = minimumHeight;

        viewer.entities.add({
            polygon: {
                perPositionHeight: true,
                hierarchy: Cesium.Cartesian3.fromDegreesArrayHeights([
                    west,
                    north,
                    height,
                    east,
                    north,
                    height,
                    east,
                    south,
                    height,
                    west,
                    south,
                    height
                ]),
                material: Color.WHITE.withAlpha(0.1),
                outline: true,
                outlineColor: Color.YELLOW
            }
        });

        const subsurfaceRectangle = Rectangle.fromDegrees(west, south, east, north, new Rectangle());
        const center = Rectangle.center(subsurfaceRectangle, new Cartographic());

        const start = new Cartographic(CesiumMath.toRadians(west), center.latitude);
        const end = new Cartographic(CesiumMath.toRadians(east), center.latitude);

        const ellipsoidLine = new EllipsoidGeodesic(start, end);

        const surfaceDistance = ellipsoidLine.surfaceDistance;

        const offsetRatio = 0.2;
        const frustumWidth = surfaceDistance * (1 + offsetRatio);

        const camera = viewer.camera;
        const frustum = camera.frustum;

        const frustumHeight = frustumWidth / frustum.aspectRatio;
        const distance = frustumHeight / Math.atan(frustum.fov / 2) / 2;

        const pitch = CesiumMath.toRadians(-15);
        const offset = new HeadingPitchRange(0, pitch, distance);

        let position = offsetFromHeadingPitchRange(offset.heading, offset.pitch, offset.range);

        const subsurfaceCenter = Cartesian3.fromRadians(center.longitude, center.latitude, minimumHeight);

        const transform = Transforms.eastNorthUpToFixedFrame(subsurfaceCenter);

        Matrix4.multiplyByPoint(transform, position, position);

        const direction = Cartesian3.subtract(subsurfaceCenter, position, scratchflyToBoundingSphereDirection);

        Cartesian3.normalize(direction, direction);

        const up = Matrix4.multiplyByPointAsVector(transform, Cartesian3.UNIT_Z, scratchflyToBoundingSphereUp);

        if (1.0 - Math.abs(Cartesian3.dot(direction, up)) < CesiumMath.EPSILON6) {
            const rotateQuat = Quaternion.fromAxisAngle(
                direction,
                offset.heading,
                scratchFlyToBoundingSphereQuaternion
            );

            const rotation = Matrix3.fromQuaternion(rotateQuat, scratchFlyToBoundingSphereMatrix3);

            Cartesian3.fromCartesian4(Matrix4.getColumn(transform, 1, scratchFlyToBoundingSphereCart4), up);
            Matrix3.multiplyByVector(rotation, up, up);
        }

        const right = Cartesian3.cross(direction, up, scratchflyToBoundingSphereRight);

        Cartesian3.cross(right, direction, up);
        Cartesian3.normalize(up, up);

        const cameraCarto = Cartographic.fromCartesian(position);

        if (cameraCarto.height >= 0) {
            console.warn(cameraCarto.height);

            position = Cartesian3.fromRadians(cameraCarto.longitude, cameraCarto.latitude, -100);
        }

        camera.flyTo({
            destination: position,
            orientation: {
                direction: direction,
                up: up
            },
            maximumHeight: cameraCarto.height
        });
    }

    document.getElementById("fly").addEventListener("click", () => {
        flyToSubsurface(subsurfaceData);
    });
}

export default main;
