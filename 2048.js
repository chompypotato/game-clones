
    // --- Utility helpers ---
    const $ = (sel, el=document) => el.querySelector(sel);
    const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

    // --- Game state ---
    const SIZE = 4;
    const boardEl = document.getElementById('board');
    const tilesEl = document.getElementById('tiles');
    const scoreEl = document.getElementById('score');
    const bestEl = document.getElementById('best');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlayMsg = document.getElementById('overlayMsg');
    const retryBtn = document.getElementById('retryBtn');
    const keepBtn = document.getElementById('keepBtn');
    const newGameBtn = document.getElementById('newGame');

    let grid, tiles, nextId, score, best, movedLock=false, keepPlaying=false;

    function init() {
      best = Number(localStorage.getItem('best2048')||0);
      bestEl.textContent = best;
      reset();
      setupInput();
      onResize();
      window.addEventListener('resize', onResize, {passive:true});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) onResize(); });
    }

    function reset() {
      grid = Array.from({length: SIZE}, () => Array(SIZE).fill(null));
      tiles = new Map();
      nextId = 1; score = 0; keepPlaying = false;
      scoreEl.textContent = '0';
      tilesEl.innerHTML = '';
      hideOverlay();
      addRandomTile(); addRandomTile();
      render(true);
    }

    function randChoice(arr){ return arr[(Math.random()*arr.length)|0]; }

    function emptyCells(){
      const cells=[]; for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(!grid[r][c]) cells.push([r,c]);
      return cells;
    }

    function addRandomTile() {
      const cells = emptyCells();
      if (!cells.length) return false;
      const [r,c] = randChoice(cells);
      const value = Math.random() < 0.9 ? 2 : 4;
      const id = nextId++;
      grid[r][c] = id;
      tiles.set(id, { id, r, c, value, merging:false, toRemove:false, el:null });
      const el = createTileEl(value);
      tiles.get(id).el = el;
      tilesEl.appendChild(el);
      positionTile(tiles.get(id), true);
      el.classList.add('new');
      return true;
    }

    function createTileEl(value){
      const d = document.createElement('div');
      d.className = `tile t${value}`;
      d.textContent = value;
      d.setAttribute('role','img');
      d.setAttribute('aria-label', `${value}`);
      return d;
    }

    function cellSize() {
      const wrap = boardEl.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 12;
      const inner = wrap.width - gap*2;
      const size = (inner - gap*3) / 4; // 4 cells -> 3 gaps
      return { size, gap };
    }

    function positionTile(tile, noTransition=false){
      const { size, gap } = cellSize();
      const x = tile.c * (size + gap);
      const y = tile.r * (size + gap);
      const el = tile.el;
      el.style.setProperty('--x', x+"px");
      el.style.setProperty('--y', y+"px");
      el.style.setProperty('--size', size+"px");
      if(noTransition){ el.style.transition = 'none'; requestAnimationFrame(()=>{ el.style.transition='transform 120ms ease-in, filter 100ms ease-in'; }); }
    }

    function onResize(){
      tiles.forEach(t => positionTile(t, true));
    }

    // --- Rendering / bookkeeping ---
    function render(full=false){
      // Update classes / numbers for all tiles
      tiles.forEach(t => {
        const el = t.el;
        el.className = `tile t${Math.min(t.value,4096)}`;
        el.textContent = t.value;
        positionTile(t, full);
      });
    }

    function setScore(delta){
      score += delta;
      scoreEl.textContent = score;
      if (score > best) {
        best = score; bestEl.textContent = best; localStorage.setItem('best2048', String(best));
      }
    }

    function showOverlay(title, msg, showKeep=false){
      overlayTitle.textContent = title; overlayMsg.textContent = msg; overlay.classList.add('show');
      keepBtn.style.display = showKeep ? '' : 'none';
    }
    function hideOverlay(){ overlay.classList.remove('show'); }

    // --- Movement logic ---
    const DIRS = { left:[0,-1], right:[0,1], up:[-1,0], down:[1,0] };

    function move(dir){
      if(movedLock) return; movedLock=true;
      const [dr, dc] = DIRS[dir];
      let moved=false; let gained=0;

      const order = [];
      for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) order.push([r,c]);
      order.sort((a,b)=>{ // ensure we iterate from the edge in movement direction
        const [ar,ac]=a,[br,bc]=b; return (dr||dc) ? (dr? (dr>0? br-ar: ar-br) : (dc>0? bc-ac: ac-bc)) : 0; });

      // reset merge flags
      tiles.forEach(t=>t.merging=false);

      for(const [r,c] of order){
        const id = grid[r][c]; if(!id) continue;
        const t = tiles.get(id); let nr=r, nc=c;
        while(true){
          const rr = nr+dr, cc = nc+dc;
          if(rr<0||rr>=SIZE||cc<0||cc>=SIZE) break;
          const target = grid[rr][cc];
          if(!target){ nr=rr; nc=cc; continue; }
          const other = tiles.get(target);
          if(other.value===t.value && !other.merging && !t.merging){
            nr=rr; nc=cc; // will merge here
          }
          break;
        }
        if(nr===r && nc===c) continue; // no move
        moved=true;
        const destId = grid[nr][nc];
        grid[r][c]=null;
        if(destId){
          // merge
          const o = tiles.get(destId);
          o.toRemove = true; o.merging=true;
          t.r = nr; t.c = nc; t.value *= 2; t.merging=true;
          grid[nr][nc] = t.id;

          // animate: move then pulse; remove old tile after transition
          positionTile(t);
          t.el.addEventListener('transitionend', ()=>{ t.el.classList.add('merged'); }, {once:true});
          setTimeout(()=>{
            if(o.el && o.el.parentNode) o.el.parentNode.removeChild(o.el);
            tiles.delete(o.id);
          }, 120);

          gained += t.value;
        } else {
          // simple slide
          t.r = nr; t.c = nc; grid[nr][nc] = t.id;
          positionTile(t);
        }
      }

      if(moved){
        setTimeout(()=>{
          if(addRandomTile()) render();
          setScore(gained);
          checkEnd();
          movedLock=false;
        }, 125);
      } else {
        movedLock=false;
      }
    }

    function movesAvailable(){
      if(emptyCells().length>0) return true;
      for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
        const id = grid[r][c]; if(!id) continue; const v = tiles.get(id).value;
        for(const [dr,dc] of Object.values(DIRS)){
          const rr=r+dr, cc=c+dc; if(rr<0||rr>=SIZE||cc<0||cc>=SIZE) continue;
          const nid = grid[rr][cc]; if(!nid) return true;
          if(tiles.get(nid).value===v) return true;
        }
      }
      return false;
    }

    function checkEnd(){
      // Win condition
      let has2048=false; tiles.forEach(t=>{ if(t.value>=2048) has2048=true; });
      if(has2048 && !keepPlaying){
        showOverlay('You Win! 🎉', 'You made 2048. Keep going or start a new game?', true);
        return;
      }
      // Lose condition
      if(!movesAvailable()){
        showOverlay('Game Over', 'No more moves. Want to try again?');
      }
    }

    // --- Inputs ---
    function setupInput(){
      document.addEventListener('keydown', e=>{
        const k = e.key.toLowerCase();
        if(['arrowleft','a'].includes(k)) { e.preventDefault(); move('left'); }
        else if(['arrowright','d'].includes(k)) { e.preventDefault(); move('right'); }
        else if(['arrowup','w'].includes(k)) { e.preventDefault(); move('up'); }
        else if(['arrowdown','s'].includes(k)) { e.preventDefault(); move('down'); }
        else if(k==='n') { e.preventDefault(); reset(); }
      }, {passive:false});

      // D-pad buttons
      $$('.padbtn').forEach(b=> b.addEventListener('click', ()=> move(b.dataset.dir)));

      // Touch swipe
      let startX=0, startY=0, started=false;
      const threshold = 20; // px
      const touchOpts = { passive: true };
      boardEl.addEventListener('touchstart', e=>{ if(e.touches.length!==1) return; started=true; startX=e.touches[0].clientX; startY=e.touches[0].clientY; }, touchOpts);
      boardEl.addEventListener('touchmove', e=>{ /* prevent scroll on strong swipe vertically on iOS */ }, {passive:true});
      boardEl.addEventListener('touchend', e=>{
        if(!started) return; started=false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX; const dy = t.clientY - startY;
        if(Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
        if(Math.abs(dx) > Math.abs(dy)) move(dx>0? 'right':'left'); else move(dy>0? 'down':'up');
      }, touchOpts);

      // Overlay buttons
      retryBtn.addEventListener('click', ()=>{ hideOverlay(); reset(); });
      keepBtn.addEventListener('click', ()=>{ hideOverlay(); keepPlaying = true; });
      newGameBtn.addEventListener('click', reset);
    }

    // --- Start ---
    init();
