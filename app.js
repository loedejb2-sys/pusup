const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const counterElement = document.getElementById('counter');
const statusElement = document.getElementById('status');

let pushupCount = 0;
let pushupState = "up"; // Tracks whether user is currently "up" or "down"

// Helper function to calculate the angle between three joints (e.g., Shoulder, Elbow, Wrist)
function calculateAngle(a, b, c) {
    let radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
        angle = 360 - angle;
    }
    return angle;
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the webcam frame onto the canvas
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        // Draw the skeleton keypoints and connections
        window.drawConnectors(canvasCtx, results.poseLandmarks, window.POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
        window.drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#FF0000', lineWidth: 1});

        // Extract required coordinates (using right side: Shoulder=12, Elbow=14, Wrist=16)
        const shoulders = results.poseLandmarks[12];
        const elbows = results.poseLandmarks[14];
        const wrists = results.poseLandmarks[16];

        if (shoulders && elbows && wrists) {
            // Calculate elbow angle
            let elbowAngle = calculateAngle(shoulders, elbows, wrists);

            statusElement.innerText = `Elbow Angle: Math.round(elbowAngle)`;

            // Push-up counting logic using angle thresholds
            // Arms bent (down position): angle < 90 degrees
            // Arms straight (up position): angle > 160 degrees
            if (elbowAngle < 90) {
                pushupState = "down";
            }
            if (elbowAngle > 160 && pushupState === "down") {
                pushupState = "up";
                pushupCount++;
                counterElement.innerText = pushupCount;
            }
        }
    } else {
        statusElement.innerText = "Status: Position yourself sideways to the camera";
    }
    canvasCtx.restore();
}

// Initialize MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);

// Start the webcam feed
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({image: videoElement});
    },
    width: 640,
    height: 480
});

camera.start()
.then(() => {
    statusElement.innerText = "Status: Camera active. Ready!";
})
.catch(err => {
    statusElement.innerText = "Error: Camera access denied or unavailable.";
    console.error(err);
});
