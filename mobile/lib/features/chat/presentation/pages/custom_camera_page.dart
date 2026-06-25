import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../domain/entities/message.dart';

class CustomCameraPage extends StatefulWidget {
  const CustomCameraPage({super.key});

  @override
  State<CustomCameraPage> createState() => _CustomCameraPageState();
}

class _CustomCameraPageState extends State<CustomCameraPage> {
  CameraController? _controller;
  List<CameraDescription> _cameras = [];
  bool _isRecording = false;
  bool _isInitialized = false;
  int _currentCameraIdx = 0;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  Future<void> _initCamera() async {
    _cameras = await availableCameras();
    if (_cameras.isNotEmpty) {
      _setCamera(_cameras[0]);
    }
  }

  Future<void> _setCamera(CameraDescription camera) async {
    final oldController = _controller;
    _controller = CameraController(
      camera,
      ResolutionPreset.high,
      enableAudio: true,
    );

    try {
      await _controller!.initialize();
      if (mounted) {
        setState(() {
          _isInitialized = true;
        });
      }
    } catch (e) {
      debugPrint('Camera error: $e');
    }
    
    if (oldController != null) {
      await oldController.dispose();
    }
  }

  void _switchCamera() {
    if (_cameras.length < 2) return;
    _currentCameraIdx = (_currentCameraIdx + 1) % _cameras.length;
    _setCamera(_cameras[_currentCameraIdx]);
  }

  Future<void> _takePhoto() async {
    if (!_isInitialized || _controller == null) return;
    try {
      final file = await _controller!.takePicture();
      if (mounted) {
        context.pop({'path': file.path, 'type': MessageType.image});
      }
    } catch (e) {
      debugPrint('Error taking photo: $e');
    }
  }

  Future<void> _startRecording() async {
    if (!_isInitialized || _controller == null) return;
    try {
      await _controller!.startVideoRecording();
      setState(() {
        _isRecording = true;
      });
    } catch (e) {
      debugPrint('Error starting video: $e');
    }
  }

  Future<void> _stopRecording() async {
    if (!_isRecording || _controller == null) return;
    try {
      final file = await _controller!.stopVideoRecording();
      setState(() {
        _isRecording = false;
      });
      if (mounted) {
        context.pop({'path': file.path, 'type': MessageType.video});
      }
    } catch (e) {
      debugPrint('Error stopping video: $e');
    }
  }

  Future<void> _pickFromGallery() async {
    // Return a special flag to let the caller open the full gallery
    context.pop({'gallery': true});
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_isInitialized || _controller == null) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator(color: Colors.white)),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Camera Preview Full Screen
          Positioned.fill(
            child: CameraPreview(_controller!),
          ),

          // Top actions (Close, Flash)
          Positioned(
            top: 50,
            left: 16,
            child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 28),
              onPressed: () => context.pop(),
            ),
          ),
          
          // Bottom controls
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 16),

                // Shutter and actions
                Padding(
                  padding: const EdgeInsets.only(bottom: 40, left: 32, right: 32),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Gallery button
                      IconButton(
                        icon: const Icon(Icons.photo_library, color: Colors.white, size: 32),
                        onPressed: _pickFromGallery,
                      ),
                      
                      // Shutter button (Tap = Photo, Hold = Video)
                      GestureDetector(
                        onTap: _takePhoto,
                        onLongPressStart: (_) => _startRecording(),
                        onLongPressEnd: (_) => _stopRecording(),
                        child: Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 4),
                            color: _isRecording ? Colors.red : Colors.transparent,
                          ),
                          child: Center(
                            child: Container(
                              width: _isRecording ? 30 : 65,
                              height: _isRecording ? 30 : 65,
                              decoration: BoxDecoration(
                                shape: _isRecording ? BoxShape.rectangle : BoxShape.circle,
                                borderRadius: _isRecording ? BorderRadius.circular(8) : null,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
                      
                      // Switch Camera button
                      IconButton(
                        icon: const Icon(Icons.flip_camera_ios, color: Colors.white, size: 32),
                        onPressed: _switchCamera,
                      ),
                    ],
                  ),
                ),
                
                // Instructions
                const Padding(
                  padding: EdgeInsets.only(bottom: 16),
                  child: Text(
                    'Hold for video, tap for photo',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                )
              ],
            ),
          ),
        ],
      ),
    );
  }
}
