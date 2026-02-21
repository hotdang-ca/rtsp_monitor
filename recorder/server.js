const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const RECORDINGS_BASE_DIR = path.join(__dirname, 'recordings');

// access the RTSP streams from the environment variables
const CAMERAS = [];
if (process.env.RTSP_SOURCE_1) {
    console.log('RTSP_SOURCE_1: ' + process.env.RTSP_SOURCE_1);
    CAMERAS.push({
        id: 'cam1',
        name: 'Camera 1',
        url: process.env.RTSP_SOURCE_1,
        rtspPath: 'cam1_monitor'
    });
}
if (process.env.RTSP_SOURCE_2) {
    console.log('RTSP_SOURCE_2: ' + process.env.RTSP_SOURCE_2);
    CAMERAS.push({
        id: 'cam2',
        name: 'Camera 2',
        url: process.env.RTSP_SOURCE_2,
        rtspPath: 'cam2_monitor'
    });
}
if (process.env.RTSP_SOURCE_3) {
    console.log('RTSP_SOURCE_3: ' + process.env.RTSP_SOURCE_3);
    CAMERAS.push({
        id: 'cam3',
        name: 'Camera 3',
        url: process.env.RTSP_SOURCE_3,
        rtspPath: 'cam3_monitor'
    });
}
if (process.env.RTSP_SOURCE_4) {
    console.log('RTSP_SOURCE_4: ' + process.env.RTSP_SOURCE_4);
    CAMERAS.push({
        id: 'cam4',
        name: 'Camera 4',
        url: process.env.RTSP_SOURCE_4,
        rtspPath: 'cam4_monitor'
    });
}
if (process.env.RTSP_SOURCE_5) {
    console.log('RTSP_SOURCE_5: ' + process.env.RTSP_SOURCE_5);
    CAMERAS.push({
        id: 'cam5',
        name: 'Camera 5',
        url: process.env.RTSP_SOURCE_5,
        rtspPath: 'cam5_monitor'
    });
}
if (process.env.RTSP_SOURCE_6) {
    console.log('RTSP_SOURCE_6: ' + process.env.RTSP_SOURCE_6);
    CAMERAS.push({
        id: 'cam6',
        name: 'Camera 6',
        url: process.env.RTSP_SOURCE_6,
        rtspPath: 'cam6_monitor'
    });
}

// Fallback for single source compatibility or testing if only RTSP_SOURCE is set
if (CAMERAS.length === 0 && process.env.RTSP_SOURCE) {
    CAMERAS.push({
        id: 'cam1',
        name: 'Camera 1',
        url: process.env.RTSP_SOURCE,
        rtspPath: 'cam1_monitor'
    });
}

// Ensure recordings directories exist
CAMERAS.forEach(cam => {
    const camDir = path.join(RECORDINGS_BASE_DIR, cam.id);
    if (!fs.existsSync(camDir)) {
        fs.mkdirSync(camDir, { recursive: true });
    }
});

app.use(cors());
app.use(express.static('public'));
app.use('/recordings', express.static(RECORDINGS_BASE_DIR));

// API to get camera config
app.get('/api/config', (req, res) => {
    res.json(CAMERAS.map(c => ({ id: c.id, name: c.name, rtspPath: c.rtspPath })));
});

// API to get available dates for a specific camera
app.get('/api/recordings/:cameraId/dates', (req, res) => {
    const cameraId = req.params.cameraId;
    const camDir = path.join(RECORDINGS_BASE_DIR, cameraId);

    if (!fs.existsSync(camDir)) {
        return res.json([]);
    }

    fs.readdir(camDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to list recordings' });
        }

        const dates = new Set();
        files.filter(file => file.endsWith('.mp4')).forEach(file => {
            // Filename format expected: YYYY-MM-DD_HH-MM-SS.mp4
            const datePart = file.split('_')[0];
            if (datePart && datePart.length === 10) {
                dates.add(datePart);
            }
        });

        res.json(Array.from(dates).sort().reverse());
    });
});

// API to list recordings for a specific camera
app.get('/api/recordings/:cameraId', (req, res) => {
    const cameraId = req.params.cameraId;
    const dateQuery = req.query.date; // Optional: YYYY-MM-DD
    const camDir = path.join(RECORDINGS_BASE_DIR, cameraId);

    if (!fs.existsSync(camDir)) {
        return res.json([]);
    }

    fs.readdir(camDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to list recordings' });
        }

        let mp4Files = files.filter(file => file.endsWith('.mp4'));

        if (dateQuery) {
            mp4Files = mp4Files.filter(file => file.startsWith(dateQuery));
            // When querying by date (usually for playback), return in chronological order
            mp4Files.sort();
        } else {
            // Default: newest first
            mp4Files.sort().reverse();
        }

        res.json(mp4Files);
    });
});

const ffmpegCommands = {};

function startCamera(camera) {
    if (!camera.url) {
        console.error(`URL not set for ${camera.name}. Recording disabled.`);
        return;
    }

    const camDir = path.join(RECORDINGS_BASE_DIR, camera.id);
    console.log(`Starting recording for ${camera.name} from ${camera.url}...`);

    const command = ffmpeg(camera.url)
        .inputOptions([
            '-rtsp_transport', 'tcp',
            '-use_wallclock_as_timestamps', '1',
            '-fflags', '+genpts'
        ])
        // Output 1: RTMP/RTSP stream to MediaMTX for browser viewing (AAC audio)
        .output(`rtsp://mediamtx:8554/${camera.rtspPath}`)
        .outputOptions([
            '-c:v copy',
            '-an', // CRITICAL: Camera sends 0 audio packets despite advertising track. Disabling audio avoids FFmpeg stall.
            '-f rtsp'
        ])
        // Output 2: File recording
        .output(path.join(camDir, '%Y-%m-%d_%H-%M-%S.mp4'))
        .outputOptions([
            '-c copy',
            '-f segment',
            '-segment_time 10',
            '-strftime 1',
            '-reset_timestamps 1'
        ])
        .on('start', (commandLine) => {
            console.log(`[${camera.name}] FFmpeg process started:`, commandLine);
        })
        .on('stderr', (stderrLine) => {
            // console.log(`[${camera.name}] FFmpeg stderr:`, stderrLine);
        })
        .on('error', (err, stdout, stderr) => {
            console.error(`[${camera.name}] FFmpeg error:`, err.message);
            // Retry after delay
            setTimeout(() => startCamera(camera), 5000);
        })
        .on('end', () => {
            console.log(`[${camera.name}] FFmpeg process ended. Restarting...`);
            setTimeout(() => startCamera(camera), 1000);
        });

    ffmpegCommands[camera.id] = command;
    command.run();
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Found ' + CAMERAS.length + ' cameras defined');
    CAMERAS.forEach(startCamera);
});
