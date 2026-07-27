const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const counterElement = document.getElementById('counter');
const statusElement = document.getElementById('status');

let pushupCount = 0;
let pushupState = "up"; 
let systemActive = false; 

// Storage for latest frame data
let latestPose = null;
let latestHands = null;

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

// Strict Thumbs-Up Logic using MediaPipe Hands (21 precise keypoints)
// Index(8), Middle(12), Ring(16), Pinky(20) must be curled inwards (tips higher/lower than PIP joints depending on orientation).
// Simplest geometric check for thumbs up: Thumb tip (4) is extended far away from index knuckle (5), 
// and fingers 8, 12, 16, 20 are folded down towards the palm base (0).
function isStrictThumbsUp(landmarks) {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const indexMcp = landmarks[5];
    const pinkyTip = landmarks[20];

    // 1. Thumb tip must be extended upward relative to hand base
    const thumbExtended = thumbTip.y < indexMcp.y;

    // 2. Other fingers must be folded (tips closer to wrist than their intermediate knuckles)
    const indexFolded = landmarks[8].y > landmarks[6].y;
    const middleFolded = landmarks[12].y > landmarks[10].y;
    const ringFolded = landmarks[16].y > landmarks[14].y;
    const pinkyFolded = landmarks[20].y > landmarks[18].y;

    return thumbExtended && indexFolded && middleFolded && ringFolded && pinkyFolded;
}

// Draw skeletons and process logic per frame
function processFrame() {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    if (latestPose && latestPose.image) {
        canvasCtx.drawImage(latestPose.image, 0, 0, canvasElement.width, canvasElement.height);
    }

    // 1. Hand Tracking & Unlock Check
    if (latestHands && latestHands.multiHandLandmarks && latestHands.multiHandLandmarks.length > 0) {
        for (const handLandmarks of latestHands.multiHandLandmarks) {
            // Draw hand skeleton skeleton (Neon Yellow/Orange)
            canvasCtx.strokeStyle = systemActive ? '#3fb950' : '#f39c12';
            canvasCtx.lineWidth = 2;
            for (let [u, v] of HAND_CONNECTIONS) {
                const p1 = handLandmarks[u];
                const p2 = handLandmarks[v];
                canvasCtx.beginPath();
                canvasCtx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
                canvasCtx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
                canvasCtx.stroke();
            }

            // Check trigger condition
            if (!systemActive) {
                if (isStrictThumbsUp(handLandmarks)) {
                    systemActive = true;
                    statusElement.innerText = "Thumbs Up Detected! Tracking Push-ups...";
                }
            }
        }
    }

    // 2. Pose Tracking & Push-up Counting Logic
    if (latestPose && latestPose.poseLandmarks) {
        const landmarks = latestPose.poseLandmarks;

        // Draw body skeleton
        canvasCtx.strokeStyle = systemActive ? '#00f2fe' : 'rgba(255,255,255,0.2)';
        canvasCtx.lineWidth = 4;
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

        // Draw joints
        for (let lm of landmarks) {
            if (lm && lm.visibility > 0.5) {
                canvasCtx.fillStyle = systemActive ? '#ff007f' : 'rgba(255,255,255,0.4)';
                canvasCtx.beginPath();
                canvasCtx.arc(lm.x * canvasElement.width, lm.y * canvasElement.height, 5, 0, 2 * Math.PI);
                canvasCtx.fill();
            }
        }

        // Push-up counting (Only runs if unlocked via thumbs up)
        if (systemActive) {
            const shoulder = landmarks[12];
            const elbow = landmarks[14];
            const wrist = landmarks[16];

            if (shoulder && elbow && wrist) {
                let elbowAngle = calculateAngle(shoulder, elbow, wrist);

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
    }

    if (!systemActive && (!latestHands || !latestHands.multiHandLandmarks || latestHands.multiHandLandmarks.length === 0)) {
        statusElement.innerText = "Locked: Hold a clear Thumbs-Up to camera to unlock counter";
    }

    canvasCtx.restore();
}

// Initialize MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});
pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
pose.onResults(results => { latestPose = results; processFrame(); });

// Initialize MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
hands.onResults(results => { latestHands = results; });

// Camera Loop feeding both models
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
        statusElement.innerText = "Camera live. Show a Thumbs Up to start.";
    })
    .catch(err => {
        statusElement.innerText = "Error: Camera access failed.";
        console.error(err);
    });
