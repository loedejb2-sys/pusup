const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const counterElement = document.getElementById('counter');
const statusElement = document.getElementById('status');

let pushupCount = 0;
let pushupState = "up"; 
let systemActive = false; // Strictly locked until valid trigger

// Core body connections for skeleton drawing
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

// Strict Thumbs-Up Logic: Right wrist (16) must be raised clearly, 
// and the elbow (14) must be bent upwards or hand held up near head/chest level.
function detectThumbsUp(landmarks) {
    const shoulder = landmarks[12];
    const elbow = landmarks[14];
    const wrist = landmarks[16];
    const thumbTip = landmarks[20];

    if (shoulder && elbow && wrist && thumbTip) {
        // Check if hand/wrist is raised above or near shoulder level (lower Y value means higher on screen)
        const isHandRaised = wrist.y < shoulder.y;
        
        // Check if thumb tip is positioned higher than the wrist itself
        const isThumbPointingUp = thumbTip.y < wrist.y;

        if (isHandRaised && isThumbPointingUp) {
            return true;
        }
    }
    return false;
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Always keep the live camera feed running on canvas
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;

        // 1. Draw Skeleton Lines (Orange = Waiting for trigger, Cyan = Active)
        canvasCtx.strokeStyle = systemActive ? '#00f2fe' : '#f39c12';
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

        // 3. System Lock / Unlock Gate
        if (!systemActive) {
            const isThumbsUp = detectThumbsUp(landmarks);

            if (isThumbsUp) {
                systemActive = true;
                statusElement.innerText = "Status: Thumbs Up confirmed! Session started.";
            } else {
                statusElement.innerText = "Status: CAMERA RUNNING. Give a clear Thumbs Up to start counting.";
            }
        } else {
            // Active Rep Counting Logic
            const shoulder = landmarks[12];
            const elbow = landmarks[14];
            const wrist = landmarks[16];

            if (shoulder && elbow && wrist) {
                let elbowAngle = calculateAngle(shoulder, elbow, wrist);
                statusElement.innerText = `Active | Elbow Angle: ${Math.round(elbowAngle)}°`;

                // Push-up state transition machine
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
        statusElement.innerText = "Status: Camera running. Step into view.";
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
        statusElement.innerText = "Status: Camera live. Raise a Thumbs Up to unlock counter.";
    })
    .catch(err => {
        statusElement.innerText = "Error: Camera access failed.";
        console.error(err);
    });
