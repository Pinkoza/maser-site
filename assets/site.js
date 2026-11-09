(function(){
var b=document.getElementById('mb'),n=document.getElementById('nv');
if(b&&n){b.addEventListener('click',function(){var o=n.classList.toggle('open');b.setAttribute('aria-expanded',o)})}
var f=document.getElementById('f');
if(f){f.addEventListener('submit',function(e){e.preventDefault();var d=new FormData(f);
location.href='mailto:contact@maserconstruction.com?subject='+encodeURIComponent('Project inquiry from '+d.get('n'))+'&body='+encodeURIComponent('Project: '+d.get('t')+' ('+d.get('p')+')\n\n'+d.get('m')+'\n\nReply to: '+d.get('e')+'\nPhone: '+(d.get('ph')||''))})}
})();