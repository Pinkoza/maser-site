(function(){
var b=document.getElementById('mb'),n=document.getElementById('nv');
if(b&&n){b.addEventListener('click',function(){var o=n.classList.toggle('open');b.setAttribute('aria-expanded',o)})}
var f=document.getElementById('f');
if(f){f.addEventListener('submit',function(e){e.preventDefault();var d=new FormData(f);
location.href='mailto:contact@maserconstruction.com?subject='+encodeURIComponent('Project inquiry from '+d.get('n'))+'&body='+encodeURIComponent('Project: '+d.get('t')+' ('+d.get('p')+')\n\n'+d.get('m')+'\n\nReply to: '+d.get('e')+'\nPhone: '+(d.get('ph')||''))})}

if(matchMedia('(pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
var cu=document.createElement('div');cu.className='cur';cu.setAttribute('aria-hidden','true');document.body.appendChild(cu);
addEventListener('pointermove',function(e){cu.style.setProperty('--x',e.clientX+'px');cu.style.setProperty('--y',e.clientY+'px');cu.classList.add('on');cu.style.setProperty('--s',(e.target.closest&&e.target.closest('a,button,summary,input,select,textarea,label'))?1.9:1)});
addEventListener('pointerdown',function(){cu.style.setProperty('--s',.7)});addEventListener('pointerup',function(){cu.style.setProperty('--s',1)});}
var pn=[].slice.call(document.querySelectorAll('.panel'));
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});pn.forEach(function(p){io.observe(p)})}else{pn.forEach(function(p){p.classList.add('in')})}
})();