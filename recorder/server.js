const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const RTSP_URL = process.env.RTSP_SOURCE;

// Ensure recordings directory exists
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.static('public'));
app.use('/recordings', express.static(RECORDINGS_DIR));

// API to list recordings
app.get('/api/recordings', (req, res) => {
    fs.readdir(RECORDINGS_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to list recordings' });
        }
        const mp4Files = files.filter(file => file.endsWith('.mp4')).sort().reverse();
        res.json(mp4Files);
    });
});

let ffmpegCommand = null;

function startRecording() {
    if (!RTSP_URL) {
        console.error('RTSP_SOURCE environment variable not set. Recording disabled.');
        return;
    }

    console.log(`Starting recording from ${RTSP_URL}...`);

    ffmpegCommand = ffmpeg(RTSP_URL)
        .inputOptions([
            '-rtsp_transport', 'tcp',
            '-use_wallclock_as_timestamps', '1',
            '-fflags', '+genpts'
        ])
        // Output 1: RTMP/RTSP stream to MediaMTX for browser viewing (AAC audio)
        .output('rtsp://mediamtx:8554/cam1_monitor')
        .outputOptions([
            '-c:v copy',
            '-an', // CRITICAL: Camera sends 0 audio packets despite advertising track. Disabling audio avoids FFmpeg stall.
            '-f rtsp'
        ])
        // Output 2: File recording
        .output(path.join(RECORDINGS_DIR, '%Y-%m-%d_%H-%M-%S.mp4'))
        .outputOptions([
            '-c copy',
            '-f segment',
            '-segment_time 10',
            '-strftime 1',
            '-reset_timestamps 1'
        ])
        .on('start', (commandLine) => {
            console.log('FFmpeg process started:', commandLine);
        })
        .on('stderr', (stderrLine) => {
            console.log('FFmpeg stderr:', stderrLine);
        })
        .on('error', (err, stdout, stderr) => {
            console.error('FFmpeg error:', err.message);
            // Retry after delay
            setTimeout(startRecording, 5000);
        })
        .on('end', () => {
            console.log('FFmpeg process ended. Restarting...');
            setTimeout(startRecording, 1000);
        });

    ffmpegCommand.run();
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startRecording();
});
