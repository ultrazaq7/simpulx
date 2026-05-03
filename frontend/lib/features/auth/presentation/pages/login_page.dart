// ============================================================
// Login Page - Aligned with Landing Page Dark Design
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/core/widgets/simpulx_logo.dart';

// Landing-page color tokens
const _kBg = Color(0xFF060608);
const _kBlue = Color(0xFF60A5FA);
const _kGreen = Color(0xFF34D399);
const _kPurple = Color(0xFFA78BFA);
const _kPrimary = Color(0xFF3B82F6);
const _kPrimaryDark = Color(0xFF0D47A1);

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  late AnimationController _animController;
  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _fadeAnim = CurvedAnimation(parent: _animController, curve: Curves.easeOut);
    _slideAnim = Tween<Offset>(
      begin: const Offset(0, 0.05),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _animController, curve: Curves.easeOutCubic));
    _animController.forward();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _animController.dispose();
    super.dispose();
  }

  void _onLogin() {
    if (_formKey.currentState!.validate()) {
      context.read<AuthBloc>().add(LoginEvent(
            email: _emailController.text.trim(),
            password: _passwordController.text,
          ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isDesktop = size.width >= 900;

    return Scaffold(
      backgroundColor: _kBg,
      body: BlocListener<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthAuthenticated) context.go('/dashboard');
          if (state is AuthError) AppSnackbar.error(context, state.message);
        },
        child: Row(
          children: [
            // ── Left branding panel (Desktop only) ──
            if (isDesktop)
              Expanded(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color(0xFF060608),
                        Color(0xFF0A1628),
                        Color(0xFF0D2B5A),
                      ],
                    ),
                  ),
                  child: Stack(
                    children: [
                      // Grid
                      Positioned.fill(child: CustomPaint(painter: _GridPainter())),
                      // Blue glow top-left
                      Positioned(
                        top: size.height * 0.08,
                        left: -80,
                        child: Container(
                          width: 420,
                          height: 420,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [Color(0x281877F2), Colors.transparent],
                            ),
                          ),
                        ),
                      ),
                      // Green glow bottom-right
                      Positioned(
                        bottom: size.height * 0.08,
                        right: -80,
                        child: Container(
                          width: 300,
                          height: 300,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [Color(0x1A34D399), Colors.transparent],
                            ),
                          ),
                        ),
                      ),
                      // Content
                      Center(
                        child: FadeTransition(
                          opacity: _fadeAnim,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 52),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Logo row
                                Row(
                                  children: [
                                    const SimpulxLogo(size: 44, onDark: true),
                                    const SizedBox(width: 12),
                                    ShaderMask(
                                      shaderCallback: (bounds) =>
                                          const LinearGradient(
                                        colors: [_kBlue, _kGreen],
                                      ).createShader(bounds),
                                      child: const Text(
                                        'Simpulx',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 26,
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: -0.5,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 52),
                                // Headline
                                const Text(
                                  'Your team\nmessaging hub.',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 34,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -1.0,
                                    height: 1.15,
                                  ),
                                ),
                                const SizedBox(height: 14),
                                Text(
                                  'Omnichannel WhatsApp platform\nfor modern support teams.',
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.42),
                                    fontSize: 15,
                                    height: 1.65,
                                  ),
                                ),
                                const SizedBox(height: 44),
                                // Feature pills
                                ...[
                                  (_kBlue, '💬', 'Multi-channel messaging'),
                                  (_kGreen, '🏢', 'Department management'),
                                  (_kPurple, '🤖', 'Smart automation'),
                                  (_kBlue, '📊', 'Real-time analytics'),
                                ].map(
                                  (item) => Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: _FeaturePill(
                                      color: item.$1,
                                      emoji: item.$2,
                                      label: item.$3,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // ── Right: login form ──
            SizedBox(
              width: isDesktop ? 480 : size.width,
              child: Container(
                color: _kBg,
                child: Center(
                  child: SingleChildScrollView(
                    padding: EdgeInsets.symmetric(
                      horizontal: isDesktop ? 52 : 28,
                      vertical: 48,
                    ),
                    child: SlideTransition(
                      position: _slideAnim,
                      child: FadeTransition(
                        opacity: _fadeAnim,
                        child: Form(
                          key: _formKey,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              // Mobile logo
                              if (!isDesktop) ...[
                                const Center(
                                    child: SimpulxLogo(size: 56, onDark: true)),
                                const SizedBox(height: 24),
                              ],

                              // Header
                              Text(
                                'Welcome back',
                                textAlign: isDesktop
                                    ? TextAlign.left
                                    : TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -0.5,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Sign in to your account',
                                textAlign: isDesktop
                                    ? TextAlign.left
                                    : TextAlign.center,
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.4),
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 36),

                              // Email
                              _buildLabel('Email'),
                              const SizedBox(height: 8),
                              TextFormField(
                                controller: _emailController,
                                keyboardType: TextInputType.emailAddress,
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 14),
                                decoration: _inputDecoration(
                                  hint: 'you@company.com',
                                  icon: Icons.mail_outline_rounded,
                                ),
                                validator: (v) => v == null || v.isEmpty
                                    ? 'Enter your email'
                                    : null,
                              ),
                              const SizedBox(height: 20),

                              // Password
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  _buildLabel('Password'),
                                  MouseRegion(
                                    cursor: SystemMouseCursors.click,
                                    child: GestureDetector(
                                      onTap: () =>
                                          context.push('/forgot-password'),
                                      child: const Text(
                                        'Forgot password?',
                                        style: TextStyle(
                                          color: _kBlue,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              TextFormField(
                                controller: _passwordController,
                                obscureText: _obscurePassword,
                                textInputAction: TextInputAction.go,
                                onFieldSubmitted: (_) => _onLogin(),
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 14),
                                decoration: _inputDecoration(
                                  hint: '••••••••',
                                  icon: Icons.lock_outline_rounded,
                                ).copyWith(
                                  suffixIcon: IconButton(
                                    icon: Icon(
                                      _obscurePassword
                                          ? Icons.visibility_off_outlined
                                          : Icons.visibility_outlined,
                                      size: 20,
                                      color: Colors.white.withOpacity(0.3),
                                    ),
                                    onPressed: () => setState(() =>
                                        _obscurePassword = !_obscurePassword),
                                  ),
                                ),
                                validator: (v) => v == null || v.length < 6
                                    ? 'Min 6 characters'
                                    : null,
                              ),
                              const SizedBox(height: 32),

                              // Sign-in button
                              BlocBuilder<AuthBloc, AuthState>(
                                builder: (context, state) {
                                  final isLoading = state is AuthLoading;
                                  return SizedBox(
                                    height: 50,
                                    child: _GradientButton(
                                      onPressed: isLoading ? null : _onLogin,
                                      isLoading: isLoading,
                                    ),
                                  );
                                },
                              ),

                              const SizedBox(height: 36),
                              Center(
                                child: Text(
                                  '© ${DateTime.now().year} Simpulx. All rights reserved.',
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.18),
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLabel(String text) => Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: Colors.white.withOpacity(0.5),
        ),
      );

  InputDecoration _inputDecoration(
      {required String hint, required IconData icon}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: Colors.white.withOpacity(0.2)),
      prefixIcon:
          Icon(icon, size: 20, color: Colors.white.withOpacity(0.3)),
      filled: true,
      fillColor: const Color(0x0DFFFFFF), // rgba(255,255,255,.05)
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0x1AFFFFFF)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0x1AFFFFFF)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _kBlue, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFEF4444)),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
      ),
    );
  }
}

// ── Gradient sign-in button ──
class _GradientButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final bool isLoading;

  const _GradientButton({required this.onPressed, required this.isLoading});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: onPressed == null
            ? const LinearGradient(
                colors: [Color(0xFF2A2A2A), Color(0xFF1A1A1A)])
            : const LinearGradient(
                colors: [_kPrimary, _kPrimaryDark],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: onPressed == null
            ? null
            : [
                BoxShadow(
                  color: _kPrimary.withOpacity(0.35),
                  blurRadius: 20,
                  offset: const Offset(0, 6),
                ),
              ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onPressed,
          child: Center(
            child: isLoading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : const Text(
                    'Sign In',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

// ── Feature pill (left panel) ──
class _FeaturePill extends StatelessWidget {
  final Color color;
  final String emoji;
  final String label;

  const _FeaturePill(
      {required this.color, required this.emoji, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.06),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: color.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 15)),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withOpacity(0.55),
              fontSize: 13,
              fontWeight: FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Subtle grid background ──
class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withOpacity(0.025)
      ..strokeWidth = 1;

    const spacing = 40.0;
    for (double x = 0; x < size.width; x += spacing) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += spacing) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
