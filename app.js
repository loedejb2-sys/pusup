const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const counterElement = document.getElementById('counter');
const statusElement = document.getElementById('status');

let pushupCount = 0;
let pushupState = "up"; 
let systemActive = false; // System starts locked until triggered

// Core body connections
const POSE_CONNECTIONS = [
    [11, 12], // Shoulders
    [11, 13], [13, 15], // Left arm
    [12, 14], [14, 16], // Right arm
    [11, 23], [12, 24], // Torso
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

// Check if user is showing a thumbs up (Wrist Y vs Thumb Tip Y check)
function detectThumbsUp(landmarks) {
    // Right hand wrist is landmark 16, thumb tip is landmark 20
    const wrist = landmarks[16];
    const thumbTip = landmarks[20];
    const indexTip = landmarks[8];

    if (wrist && thumbTip && indexTip) {
        // If thumb tip is significantly higher (lower Y value on canvas) than index finger / wrist
        if (thumbTip.y < wrist.y && thumbTip.y < indexTip.y) {
            return true;
        }
    }
    return false;
}

// Check if user is in a proper top-of-pushup (plank) position
function isInPushupPosition(landmarks) {
    const shoulder = landmarks[12];
    const hip = landmarks[24];
    const ankle = landmarks[28]; // If visible, or use wrist/elbow check

    if (shoulder && hip) {
        // Check if torso is roughly horizontal or diagonal (plank shape)
        // For a minimal check, ensure shoulders and hips are stable and elbows are extended
        const wrist = landmarks[16];
        const elbow = landmarks[14];
        if (shoulder && elbow && wrist) {
            let elbowAngle = calculateAngle(shoulder, elbow, wrist);
            // Arms should be relatively straight to start (plank/up position)
            if (elbowAngle > 150) {
                return true;
            }
        }
    }
    return false;
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw mirrored webcam frame
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;

        // 1. Draw Skeleton Lines
        canvasCtx.strokeStyle = systemActive ? '#00f2fe' : '#f39c12'; // Cyan if active, Orange if waiting
        canvasCtx.lineWidth = 4;
        canvasCtx.lineCap = 'round';

        for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
            const [u, v] = POSE_CONNECTIONS[i];
            const p1 = landmarks[u];
            const p2 = landmarks[v];

            if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
                canvasCtx.beginPath();
                canvasCtx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
                canvasCtx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
                canvasCtx.stroke();
            }
        }

        // 2. Draw Joints
        for (let i = 0; i < landmarks.length; i++) {
            const lm = landmarks[i];
            if (lm && lm.visibility > 0.5) {
                canvasCtx.fillStyle = systemActive ? '#ff007f' : '#e67e22';
                canvasCtx.beginPath();
                canvasCtx.arc(lm.x * canvasElement.width, lm.y * canvasElement.height, 5, 0, 2 * Math.PI);
                canvasCtx.fill();
            }
        }

        // 3. Activation & Counting Logic
        if (!systemActive) {
            // Check for activation triggers
            const isThumbsUp = detectThumbsUp(landmarks);
            const inPosition = isInPushupPosition(landmarks);

            if (isThumbsUp) {
                systemActive = true;
                statusElement.innerText = "Status: Thumbs Up detected! Starting session...";
            } else if (inPosition) {
                systemActive = true;
                statusElement.innerText = "Status: Position locked! Begin push-ups.";
            } else {
                statusElement.innerText = "Status: Give a Thumbs Up or get into Plank position to start.";
            }
        } else {
            // Active Counting Logic
            const shoulder = landmarks[12];
            const elbow = landmarks[14];
            const wrist = landmarks[16];

            if (shoulder && elbow && wrist) {
                let elbowAngle = calculateAngle(shoulder, elbow, wrist);
                statusElement.innerText = `Active | Elbow Angle: ${Math.round(elbowAngle)}°`;

                if (elbowAngle < 90 && pushupState === "up") {
                    pushupState = "down";
                }
                if (elbowAngle > 160 && pushupState === "down") {
                    pushupState = "up";
                    pushupCount++;
                    counterElement.innerText = pushupCount;
                }
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
    modelComplexity: 1,
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
        statusElement.innerText = "Status: Camera active. Give a Thumbs Up to start!";
    })
    .catch(err => {
        statusElement.innerText = "Error: Camera access failed.";
        console.error(err);
    });
