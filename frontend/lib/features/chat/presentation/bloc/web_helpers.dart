// Conditional export - resolved by the compiler based on platform
export 'web_helpers_stub.dart'
    if (dart.library.html) 'web_helpers_web.dart';
