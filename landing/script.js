// ============================================================
// Simpulx Landing Page — Animations & Interactions
// ============================================================
gsap.registerPlugin(ScrollTrigger);

// ── Navbar scroll effect ────────────────────────────────
var navbar = document.getElementById("navbar");
window.addEventListener("scroll", function(){
    navbar.classList.toggle("scrolled", scrollY > 20);
}, {passive: true});

// ── Mobile menu toggle ──────────────────────────────────
document.getElementById("menuToggle").addEventListener("click", function(){
    document.getElementById("navLinks").classList.toggle("active");
});

// Close menu on link click (mobile)
document.querySelectorAll(".nav-links a").forEach(function(link){
    link.addEventListener("click", function(){
        document.getElementById("navLinks").classList.remove("active");
    });
});

// ── Canvas particles ────────────────────────────────────
var canvas = document.getElementById("particle-canvas");
var ctx = canvas.getContext("2d");
var W, H;
function resize(){ W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
resize();
window.addEventListener("resize", resize);

var COLORS = ["#60a5fa","#34d399","#a78bfa","#f472b6","#38bdf8","#4ade80"];
var particles = [];
for(var i = 0; i < 50; i++){
    particles.push({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        vy: -(0.2 + Math.random() * 0.5),
        vx: (Math.random() - .5) * 0.2,
        size: 2 + Math.random() * 3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: 0.15 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.4
    });
}

function drawParticles(){
    ctx.clearRect(0, 0, W, H);
    var t = performance.now() / 1000;
    for(var i = 0; i < particles.length; i++){
        var p = particles[i];
        p.x += p.vx + Math.sin(t * p.speed + p.phase) * 0.3;
        p.y += p.vy;
        if(p.y < -10){ p.y = H + 10; p.x = Math.random() * W; }
        if(p.x < -10) p.x = W + 10;
        if(p.x > W + 10) p.x = -10;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
    }
    requestAnimationFrame(drawParticles);
}
drawParticles();

// ── GSAP hero animations ────────────────────────────────
var tl = gsap.timeline({defaults:{ease:"power3.out"}});
tl.from("#badge",       {y:-20, opacity:0, duration:.6})
  .from("#headline",    {y:30,  opacity:0, duration:.7}, "-=.3")
  .from("#hero-sub",    {y:30,  opacity:0, duration:.7}, "-=.4")
  .from("#hero-btns",   {y:30,  opacity:0, duration:.7}, "-=.4")
  .from("#hero-visual", {x:60,  opacity:0, duration:.9}, "-=.7");

// ── Scroll animations for sections ─────────────────────
gsap.utils.toArray(".fc").forEach(function(card, i){
    gsap.from(card, {
        scrollTrigger:{trigger:card, start:"top 88%"},
        y:40, opacity:0, duration:.6, delay:(i % 3) * 0.1, ease:"power3.out"
    });
});

gsap.utils.toArray(".pain-card").forEach(function(card, i){
    gsap.from(card, {
        scrollTrigger:{trigger:card, start:"top 88%"},
        y:40, opacity:0, duration:.6, delay:i * 0.08, ease:"power3.out"
    });
});

gsap.utils.toArray(".pricing-card").forEach(function(card, i){
    gsap.from(card, {
        scrollTrigger:{trigger:card, start:"top 85%"},
        y:50, opacity:0, duration:.7, delay:i * 0.12, ease:"back.out(1.3)"
    });
});

gsap.utils.toArray(".section-header").forEach(function(el){
    gsap.from(el, {
        scrollTrigger:{trigger:el, start:"top 85%"},
        y:40, opacity:0, duration:.7, ease:"power3.out"
    });
});

gsap.from("#ctaBox", {
    scrollTrigger:{trigger:"#ctaBox", start:"top 80%"},
    y:60, opacity:0, scale:.97, duration:.9, ease:"power3.out"
});

// Compare table animation
gsap.from(".compare-table", {
    scrollTrigger:{trigger:".compare-table", start:"top 85%"},
    y:40, opacity:0, duration:.7, ease:"power3.out"
});

// ── Feature card shimmer on hover ───────────────────────
document.querySelectorAll(".feature-card").forEach(function(card){
    card.addEventListener("mouseenter", function(){
        var shimmer = this.querySelector(".shimmer");
        if(shimmer){
            shimmer.style.left = "-100%";
            shimmer.offsetHeight; // force reflow
            shimmer.style.left = "160%";
        }
    });
});

// ── Smooth scroll for anchor links ──────────────────────
document.querySelectorAll('a[href^="#"]').forEach(function(anchor){
    anchor.addEventListener("click", function(e){
        var target = document.querySelector(this.getAttribute("href"));
        if(target){
            e.preventDefault();
            target.scrollIntoView({behavior:"smooth", block:"start"});
        }
    });
});
