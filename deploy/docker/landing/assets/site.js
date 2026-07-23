(function(){
  if (window.__sxInit) return; window.__sxInit = true;
  var mt = document.getElementById('menuToggle'), nl = document.getElementById('navLinks');
  if (mt && nl) mt.addEventListener('click', function(){ nl.classList.toggle('open'); });
  document.querySelectorAll('.nav-dd > a').forEach(function(a){
    a.addEventListener('click', function(e){
      if (window.matchMedia('(hover: none)').matches || window.innerWidth <= 860) {
        e.preventDefault();
        var p = a.parentElement;
        document.querySelectorAll('.nav-dd.open').forEach(function(o){ if(o!==p) o.classList.remove('open'); });
        p.classList.toggle('open');
      }
    });
  });
  var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });
})();
