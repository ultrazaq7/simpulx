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

(function(){
  if (window.__sxDemos) return; window.__sxDemos = true;
  function loop(el, steps, total){
    function run(){
      for (var i=1;i<=6;i++) el.classList.remove('s'+i);
      steps.forEach(function(st,ix){ setTimeout(function(){ el.classList.add('s'+(ix+1)); }, st); });
    }
    run(); setInterval(run, total);
  }
  function countUp(el){
    var to = parseInt(el.getAttribute('data-count'),10)||0, cur=0, step=Math.max(1,Math.round(to/40));
    var iv=setInterval(function(){ cur+=step; if(cur>=to){cur=to;clearInterval(iv);} el.textContent=cur.toLocaleString('id-ID'); },30);
  }
  var seen = new IntersectionObserver(function(es){ es.forEach(function(e){
    if(!e.isIntersecting) return; seen.unobserve(e.target);
    var el=e.target, kind=el.getAttribute('data-demo');
    if (kind==='chat') loop(el,[300,1100,2600,4200,5400],9000);
    if (kind==='broadcast'){ loop(el,[300,900],8000); el.querySelectorAll('[data-count]').forEach(countUp); setInterval(function(){ el.querySelectorAll('[data-count]').forEach(countUp); },8000); }
    if (kind==='listing') loop(el,[300,1600],8000);
    if (kind==='chart'){ loop(el,[250],8000); el.querySelectorAll('[data-count]').forEach(countUp); setInterval(function(){ el.querySelectorAll('[data-count]').forEach(countUp); },8000); }
    if (kind==='call'){ var t=el.querySelector('.fd-timer'), s=0; setInterval(function(){ s=(s+1)%46; t.textContent='00:'+String(s).padStart(2,'0'); },1000); }
  }); }, { threshold: .25 });
  document.querySelectorAll('[data-demo]').forEach(function(el){ seen.observe(el); });
})();
