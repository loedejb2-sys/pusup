const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const counterElement = document.getElementById('counter');
const statusElement = document.getElementById('status');

let pushupCount = 0;
let pushupState = "up"; // "up" or "down"

// Define core body joint connections for the upper body/push-up tracking
const POSE_CONNECTIONS = [
    [11, 12], // Shoulders
    [11, 13], [13, 15], // Left arm: Shoulder -> Elbow -> Wrist
    [12, 14], [14, 16], // Right arm: Shoulder -> Elbow -> Wrist
    [11, 23], [12, 24], // Torso: Shoulders to Hips
    [23, 24]  // Hips
];

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
    
    // Draw mirrored webcam frame
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;

        // 1. Draw Custom Minimal Skeleton Connections (Lines)
        canvasCtx.strokeStyle = '#00f2fe'; // Neon cyan
        canvasCtx.lineWidth = 4;
        canvasCtx.lineCap = 'round';

        for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
            const [u, v] = POSE_CONNECTIONS[i];
            const p1 = landmarks[u];
            const p2 = landmarks[v];

            // Only draw if confidence is high enough
            if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
                canvasCtx.beginPath();
                canvasCtx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
                canvasCtx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
                canvasCtx.stroke();
            }
        }

        // 2. Draw Custom Joints (Dots)
        for (let i = 0; i < landmarks.length; i++) {
            const lm = landmarks[i];
            if (lm && lm.visibility > 0.5) {
                canvasCtx.fillStyle = '#ff007f'; // Neon pink for joints
                canvasCtx.beginPath();
                canvasCtx.arc(lm.x * canvasElement.width, lm.y * canvasElement.height, 5, 0, 2 * Math.PI);
                canvasCtx.fill();
            }
        }

        // 3. Push-Up Logic using Right Arm (Shoulder=12, Elbow=14, Wrist=16)
        const shoulder = landmarks[12];
        const elbow = landmarks[14];
        const wrist = landmarks[16];

        if (shoulder && elbow && wrist) {
            let elbowAngle = calculateAngle(shoulder, elbow, wrist);
            statusElement.innerText = `Elbow Angle: ${Math.round(elbowAngle)}°`;

            // State machine thresholds
            if (elbowAngle < 90 && pushupState === "up") {
                pushupState = "down";
            }
            if (elbowAngle > 160 && pushupState === "down") {
                pushupState = "up";
                pushupCount++;
                counterElement.innerText = pushupCount;
            }
        }
    } else {
        statusElement.innerText = "Status: Step back so your full upper body is visible";
    }
    canvasCtx.restore();
}

const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1, // 0 = light/fast, 1 = balanced, 2 = heavy/accurate
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

pose.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

camera.start()
    .then(() => {
        statusElement.innerText = "Status: Ready. Get into position!";
    })
    .catch(err => {
        statusElement.innerText = "Error: Camera access failed.";
        console.error(err);
    });
