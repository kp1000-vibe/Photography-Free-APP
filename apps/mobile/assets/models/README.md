# Bundled models

## selfie_segmenter.tflite

Finds the person in a photo for background blur and cutout. It runs on the
device through TensorFlow Lite; photos are never uploaded.

- Model: MediaPipe Selfie Segmenter (general, float16), by Google.
- Source: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
- Model card: https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter
- Licence: Apache License 2.0.
- Input: 1 x 256 x 256 x 3 float32, RGB in 0..1.
- Output: 1 x 256 x 256 x 1 float32, probability that each pixel is a person.
- SHA-256: 191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b

It is trained for people fairly close to the camera (selfies, portraits,
video calls). It does not segment pets or objects.
