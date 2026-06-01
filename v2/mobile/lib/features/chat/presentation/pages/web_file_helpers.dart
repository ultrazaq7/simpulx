// Conditional export - resolved by the compiler based on platform
export 'web_file_helpers_stub.dart'
    if (dart.library.html) 'web_file_helpers_web.dart';
