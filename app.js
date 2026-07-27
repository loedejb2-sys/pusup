const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const counterElement = document.getElementById('counter');
const statusElement = document.getElementById('status');

let pushupCount = 0;
let pushupState = "up"; 
let systemActive = false; 

// Thumbs-up confirmation buffer to require holding the gesture
let thumbsUpFrames = 0;
const REQUIRED_CONFIRMATION_FRAMES = 15; // Must hold for ~0.5 seconds

let latestPose = null;
let latestHands = null;

// Exponential Moving Average (EMA) coefficients for jitter reduction
const SMOOTHING_FACTOR = 0.6;
let smoothedPoseLandmarks = null;

function resizeCanvas() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const POSE_CONNECTIONS = [
    [11, 12], // Shoulders
    [11, 13], [13, 15], // Left arm
    [12, 14], [14, 16], // Right arm
    [11, 23], [12, 24], // Torso
    [23, 24]  // Hips
];

const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],         // Thumb
    [0,5],[5,6],[6,7],[7,8],         // Index
    [5,9],[9,10],[10,11],[11,12],    // Middle
    [9,13],[13,14],[14,15],[15,16],  // Ring
    [13,17],[17,18],[18,19],[19,20], // Pinky
    [0,17]                           // Palm base
];

function calculateAngle(a, b, c) {
    let radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

// Strict 21-point Hand Thumbs-Up Algorithm
function isStrictThumbsUp(landmarks) {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexMcp = landmarks[5];

    // 1. Thumb tip must point upward relative to base knuckles
    const thumbExtended = thumbTip.y < indexMcp.y;

    // 2. All 4 fingers must be tightly curled into a fist configuration
    const indexFolded = landmarks[8].y > landmarks[6].y;
    const middleFolded = landmarks[12].y > landmarks[10].y;
    const ringFolded = landmarks[16].y > landmarks[14].y;
    const pinkyFolded = landmarks[20].y > landmarks[18].y;

    return thumbExtended && indexFolded && middleFolded && ringFolded && pinkyFolded;
}

// Smooth coordinates across frames to eliminate jitter
function smoothLandmarks(newLandmarks) {
    if (!smoothedPoseLandmarks) {
        // Deep copy initialization
        smoothedPoseLandmarks = JSON.parse(JSON.stringify(newLandmarks));
        return smoothedPoseLandmarks;
    }

    for (let i = 0; i < newLandmarks.length; i++) {
        smoothedPoseLandmarks[i].x = SMOOTHING_FACTOR * newLandmarks[i].x + (1 - SMOOTHING_FACTOR) * smoothedPoseLandmarks[i].x;
        smoothedPoseLandmarks[i].y = SMOOTHING_FACTOR * newLandmarks[i].y + (1 - SMOOTHING_FACTOR) * smoothedPoseLandmarks[i].y;
        smoothedPoseLandmarks[i].z = SMOOTHING_FACTOR * newLandmarks[i].z + (1 - SMOOTHING_FACTOR) * smoothedPoseLandmarks[i].z;
        smoothedPoseLandmarks[i].visibility = newLandmarks[i].visibility;
    }
    return smoothedPoseLandmarks;
}

// Render Engine & Logic Pipeline
function processFrame() {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    if (latestPose && latestPose.image) {
        canvasCtx.drawImage(latestPose.image, 0, 0, canvasElement.width, canvasElement.height);
    }

    // 1. Hand Activation Gate Check
    if (!systemActive) {
        let detectedThumbsUpThisFrame = false;

        if (latestHands && latestHands.multiHandLandmarks && latestHands.multiHandLandmarks.length > 0) {
            for (const handLandmarks of latestHands.multiHandLandmarks) {
                // Render hand skeleton for feedback
                canvasCtx.strokeStyle = '#f39c12';
                canvasCtx.lineWidth = 2;
                for (let [u, v] of HAND_CONNECTIONS) {
                    const p1 = handLandmarks[u];
                    const p2 = handLandmarks[v];
                    canvasCtx.beginPath();
                    canvasCtx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
                    canvasCtx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
                    canvasCtx.stroke();
                }

                if (isStrictThumbsUp(handLandmarks)) {
                    detectedThumbsUpThisFrame = true;
                }
            }
        }

        if (detectedThumbsUpThisFrame) {
            thumbsUpFrames++;
            statusElement.innerText = `Hold Thumbs Up to Unlock... (${Math.round((thumbsUpFrames / REQUIRED_CONFIRMATION_FRAMES) * 100)}%)`;
            if (thumbsUpFrames >= REQUIRED_CONFIRMATION_FRAMES) {
                systemActive = true;
                statusElement.innerText = "System Unlocked • Begin Push-Ups";
            }
        } else {
            thumbsUpFrames = Math.max(0, thumbsUpFrames - 1); // Decay counter smoothly if dropped
            statusElement.innerText = "LOCKED: Hold a strict Thumbs Up to camera to start";
        }
    }

    // 2. Pose Tracking & Rep Calculation
    if (latestPose && latestPose.poseLandmarks) {
        const landmarks = smoothLandmarks(latestPose.poseLandmarks);

        // Render skeleton skeleton
        canvasCtx.strokeStyle = systemActive ? '#00f2fe' : 'rgba(243, 156, 18, 0.4)';
        canvasCtx.lineWidth = systemActive ? 6 : 3;
        canvasCtx.lineCap = 'round';

        for (let [u, v] of POSE_CONNECTIONS) {
            const p1 = landmarks[u];
            const p2 = landmarks[v];
            if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
                canvasCtx.beginPath();
                canvasCtx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
                canvasCtx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
                canvasCtx.stroke();
            }
        }

        // Render joints
        for (let lm of landmarks) {
            if (lm && lm.visibility > 0.5) {
                canvasCtx.fillStyle = systemActive ? '#ff007f' : 'rgba(255,255,255,0.4)';
                canvasCtx.beginPath();
                canvasCtx.arc(lm.x * canvasElement.width, lm.y * canvasElement.height, systemActive ? 7 : 4, 0, 2 * Math.PI);
                canvasCtx.fill();
            }
        }

        // Rep Counter State Machine
        if (systemActive) {
            const shoulder = landmarks[12];
            const elbow = landmarks[14];
            const wrist = landmarks[16];

            if (shoulder && elbow && wrist) {
                let elbowAngle = calculateAngle(shoulder, elbow, wrist);

                // Hysteresis thresholds for bulletproof counting accuracy
                if (elbowAngle < 90 && pushupState === "up") {
                    pushupState = "down";
                }
                if (elbowAngle > 160 && pushupState === "down") {
                    pushupState = "up";
                    pushupCount++;
                    counterElement.innerText = pushupCount;
                    
                    // Subtle UI bounce animation on rep completion
                    document.querySelector('.counter-overlay').style.transform = "scale(1.15)";
                    setTimeout(() => {
                        document.querySelector('.counter-overlay').style.transform = "scale(1)";
                    }, 100);
                }
            }
        }
    }

    canvasCtx.restore();
}

// MediaPipe Model Configurations
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});
pose.setOptions({ 
    modelComplexity: 1, 
    smoothLandmarks: true, 
    minDetectionConfidence: 0.7, 
    minTrackingConfidence: 0.7 
});
pose.onResults(results => { 
    latestPose = results; 
    processFrame(); 
});

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({ 
    maxNumHands: 1, 
    modelComplexity: 1, 
    minDetectionConfidence: 0.75, 
    minTrackingConfidence: 0.75 
});
hands.onResults(results => { 
    latestHands = results; 
});

// Hardware-Synced Camera Loop
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({ image: videoElement });
        await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720
});

camera.start()
    .then(() => {
        statusElement.innerText = "Camera Active • Hold a Thumbs Up to Unlock";
    })
    .catch(err => {
        statusElement.innerText = "Error: Camera access denied or unavailable.";
        console.error(err);
    });
