(function(){

  // ---------- state ----------
  var tree = null;   // { rootId, nodes: { id: {id,type,text,options:[{label,nextId}], outcomeType, resolution} } }
  var mode = 'build'; // 'build' | 'play'
  var selectedNodeId = null;
  var playPath = [];      // [{nodeId, label}]
  var playCurrentId = null;

  function uid(prefix){
    return (prefix||'n') + '_' + Math.random().toString(36).slice(2,8);
  }

  function sampleTree(){
    var start = uid('q'),
        powerCheck = uid('q'), commFault = uid('q'),
        powerOn = uid('o'), powerOff = uid('o'),
        commHmi = uid('o'), commEscalate = uid('o'), commAuxAcb = uid('o'),
        blank1 = uid('o'), blank2 = uid('o');
    var powerBodyText = 'HMI display screen inside the control cabinet should be lit up with a blue backlight. If the HMI screen is blank, verify that the main unit disconnect switch is in the ON position, and the service convenience breaker (CB-01) inside the control cabinet is in the ON position.';
    var nodes = {};
    nodes[start] = {
      id:start, type:'question',
      title:'What is the primary issue?',
      text:'',
      options:[
        {label:'Cooling issue', nextId:powerCheck},
        {label:'Heating issue', nextId:powerCheck},
        {label:'Communication fault', nextId:commFault}
      ]
    };
    nodes[powerCheck] = {
      id:powerCheck, type:'question',
      title:'Verify that HVAC unit is powered on',
      text:powerBodyText,
      options:[
        {label:'Yes, the power is on', nextId:powerOn},
        {label:'No, the power is off', nextId:powerOff}
      ]
    };
    nodes[commFault] = {
      id:commFault, type:'question',
      title:'Which type of comm fault is present?',
      text:'Modbus/comm fault indicates that there is a communication error between the RTU board and one of its connected components.',
      options:[
        {label:'HMI', nextId:commHmi},
        {label:'Supply VFD', nextId:commEscalate},
        {label:'Aux/ACB Board', nextId:commAuxAcb},
        {label:'Compressor VFD', nextId:commEscalate}
      ]
    };
    nodes[powerOn] = {
      id:powerOn, type:'question',
      title:'Check filters BEFORE troubleshooting',
      text:'Restricted airflow is often the cause of issues with heating performance or active faults. Before proceeding with any troubleshooting, confirm the following:\n1) Verify all disposable filters are clean\n2) Wash all metal mesh intake filters',
      options:[]
    };
    nodes[powerOff] = {
      id:powerOff, type:'question',
      title:'',
      text:'Verify with electrician that it is safe to energize the unit before proceeding with troubleshooting.',
      options:[]
    };
    nodes[commHmi] = {
      id:commHmi, type:'question',
      title:'Verify remote HMI/sensor quantity',
      text:'One or more remote HMI screens and/or wall sensors may need to be daisy-chained back to the unit-mounted HMI in the RTU control cabinet.\n\n' +
        '1) Refer to submittals and schematics to confirm how many remote HMIs/sensors should be installed.\n\n' +
        '2) Confirm that all remote HMIs/sensors have been installed and daisy-chained via CAT5 back to the RTU\'s unit-mounted HMI screen.\n\n' +
        '3) Confirm that the RTU\'s factory settings for HMI quantity match the installed quantity',
      options:[]
    };
    nodes[commEscalate] = {
      id:commEscalate, type:'question',
      title:'Contact CaptiveAire for technical assistance',
      text:'Please note the 7 digit job # from the unit nameplate and provide it to the CaptiveAire representative.\n\n' +
        'This path requires escalation. Gather the information above before contacting support.',
      options:[]
    };
    nodes[commAuxAcb] = {
      id:commAuxAcb, type:'question',
      title:'Check wiring between RTU board and aux board',
      text:'Some ERV modules ship loose and the auxiliary board requires a field-wired CAT5 connection. Verify that this connection has been made.',
      options:[]
    };
    nodes[blank1] = { id:blank1, type:'outcome', outcomeType:'neutral', resolution:'' };
    nodes[blank2] = { id:blank2, type:'outcome', outcomeType:'neutral', resolution:'' };
    return { rootId:start, nodes:nodes };
  }

  function blankTree(){
    var start = uid('q');
    var nodes = {};
    nodes[start] = { id:start, type:'question', text:'What question should someone answer first?', options:[] };
    return { rootId:start, nodes:nodes };
  }

  // ---------- helpers ----------
  function nodeList(){
    return Object.keys(tree.nodes).map(function(k){ return tree.nodes[k]; });
  }
  function shortLabel(node){
    var t = node.type === 'question' ? (node.title || node.text) : node.resolution;
    t = (t || '').trim();
    if(!t) return '(empty)';
    return t.length > 46 ? t.slice(0,46) + '…' : t;
  }
  function dotClass(node){
    if(node.type === 'outcome') return 'outcome-' + (node.outcomeType || 'neutral');
    return 'question';
  }

  // ---------- render root ----------
  function render(){
    var layout = document.getElementById('layout');
    layout.innerHTML = '';
    layout.className = 'layout' + (mode==='play' ? ' layout-play' : '');
    if(mode === 'build'){
      layout.appendChild(renderSidebar());
      layout.appendChild(renderBuildPanel());
    } else {
      layout.appendChild(renderPlaySingleColumn());
    }
    document.getElementById('tabBuild').className = mode==='build' ? 'active' : '';
    document.getElementById('tabPlay').className = mode==='play' ? 'active' : '';
  }

  // ---------- sidebar (build mode) ----------
  function deleteNode(nodeId){
    if(nodeId === tree.rootId){ alert('Set a different start node before deleting this one.'); return; }
    delete tree.nodes[nodeId];
    // clear dangling references
    nodeList().forEach(function(n){
      if(n.type === 'question'){
        (n.options||[]).forEach(function(o){ if(o.nextId === nodeId) o.nextId = ''; });
      }
    });
    if(selectedNodeId === nodeId) selectedNodeId = null;
    render();
  }

  function renderSidebar(){
    var panel = document.createElement('div');
    panel.className = 'panel';
    var h = document.createElement('h2');
    h.textContent = 'Nodes (' + nodeList().length + ')';
    panel.appendChild(h);

    var legend = document.createElement('div');
    legend.className = 'node-legend';
    [
      ['question', 'Question — has branching answers'],
      ['outcome-success', 'Resolved — fixed at this step'],
      ['outcome-neutral', 'Escalate — hand off to next tier'],
      ['outcome-fail', 'Unresolved — confirmed fault']
    ].forEach(function(pair, idx){
      if(idx === 1){
        var subhead = document.createElement('div');
        subhead.className = 'legend-subhead';
        subhead.textContent = 'Outcome nodes (end of a path)';
        legend.appendChild(subhead);
      }
      var row = document.createElement('div');
      row.className = 'legend-row';
      var dot = document.createElement('div');
      dot.className = 'node-dot ' + pair[0];
      var span = document.createElement('span');
      span.textContent = pair[1];
      row.appendChild(dot);
      row.appendChild(span);
      legend.appendChild(row);
    });
    panel.appendChild(legend);

    var list = document.createElement('div');
    list.className = 'node-list';
    nodeList().forEach(function(node){
      var item = document.createElement('div');
      item.className = 'node-item' + (node.id === selectedNodeId ? ' selected' : '');
      item.onclick = function(){ selectedNodeId = node.id; render(); };

      var dot = document.createElement('div');
      dot.className = 'node-dot ' + dotClass(node);
      item.appendChild(dot);

      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = shortLabel(node);
      item.appendChild(label);

      if(node.image){
        var imgBadge = document.createElement('div');
        imgBadge.className = 'img-badge';
        imgBadge.title = 'Has an image';
        imgBadge.textContent = '📷';
        item.appendChild(imgBadge);
      }

      if(node.id === tree.rootId){
        var badge = document.createElement('div');
        badge.className = 'root-badge';
        badge.textContent = 'START';
        item.appendChild(badge);
      }

      var delX = document.createElement('button');
      delX.className = 'node-del-x';
      delX.textContent = '×';
      delX.title = node.id === tree.rootId ? 'Set a different start node before deleting this one' : 'Delete node';
      delX.onclick = function(e){
        e.stopPropagation();
        if(node.id === tree.rootId){ alert('Set a different start node before deleting this one.'); return; }
        deleteNode(node.id);
      };
      item.appendChild(delX);

      list.appendChild(item);
    });
    panel.appendChild(list);
    return panel;
  }

  // ---------- build panel (node editor) ----------
  function renderBuildPanel(){
    var panel = document.createElement('div');
    panel.className = 'panel';

    var node = tree.nodes[selectedNodeId];
    if(!node){
      var h = document.createElement('h2');
      h.textContent = 'Node editor';
      panel.appendChild(h);
      var hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = 'Select a node on the left, or add a new one, to start editing.';
      panel.appendChild(hint);
      return panel;
    }

    var h2 = document.createElement('h2');
    h2.textContent = 'Editing · ' + node.id;
    panel.appendChild(h2);

    // type switch
    var typeSwitch = document.createElement('div');
    typeSwitch.className = 'type-switch';
    typeSwitch.style.marginBottom = '18px';
    ['question','outcome'].forEach(function(t){
      var b = document.createElement('button');
      b.textContent = t === 'question' ? 'Question node' : 'Outcome node';
      b.className = node.type === t ? 'active' : '';
      b.onclick = function(){
        node.type = t;
        if(t === 'question' && !node.options) node.options = [];
        if(t === 'outcome' && !node.outcomeType) node.outcomeType = 'neutral';
        render();
      };
      typeSwitch.appendChild(b);
    });
    panel.appendChild(typeSwitch);

    // image upload (applies to any node type)
    var fImg = document.createElement('div'); fImg.className = 'field';
    var lImg = document.createElement('label'); lImg.textContent = 'Image (optional)';
    fImg.appendChild(lImg);

    var imgRow = document.createElement('div'); imgRow.className = 'image-field-row';

    if(node.image){
      var previewWrap = document.createElement('div'); previewWrap.className = 'image-preview-wrap';
      var preview = document.createElement('img'); preview.className = 'image-preview'; preview.src = node.image;
      var removeBtn = document.createElement('button'); removeBtn.className = 'image-preview-remove'; removeBtn.textContent = '×';
      removeBtn.title = 'Remove image';
      removeBtn.onclick = function(){ node.image = null; render(); };
      previewWrap.appendChild(preview);
      previewWrap.appendChild(removeBtn);
      imgRow.appendChild(previewWrap);
    } else {
      var emptySlot = document.createElement('div'); emptySlot.className = 'image-empty-slot';
      imgRow.appendChild(emptySlot);
    }

    var imgBtnWrap = document.createElement('div');
    var imgInput = document.createElement('input');
    imgInput.type = 'file';
    imgInput.accept = 'image/*';
    var imgUploadBtn = document.createElement('button');
    imgUploadBtn.className = 'btn small';
    imgUploadBtn.textContent = node.image ? 'Replace image' : 'Upload image';
    imgUploadBtn.onclick = function(){ imgInput.click(); };
    imgInput.onchange = function(e){
      var file = e.target.files[0];
      if(!file) return;
      var reader = new FileReader();
      reader.onload = function(){
        node.image = reader.result;
        render();
      };
      reader.readAsDataURL(file);
    };
    imgBtnWrap.appendChild(imgUploadBtn);
    imgBtnWrap.appendChild(imgInput);
    imgRow.appendChild(imgBtnWrap);

    fImg.appendChild(imgRow);
    panel.appendChild(fImg);

    if(node.type === 'question'){
      // question title
      var fTitle = document.createElement('div'); fTitle.className = 'field';
      var lTitle = document.createElement('label'); lTitle.textContent = 'Question title';
      var titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = node.title || '';
      titleInput.oninput = function(){ node.title = titleInput.value; };
      titleInput.onblur = function(){ render(); };
      fTitle.appendChild(lTitle); fTitle.appendChild(titleInput);
      panel.appendChild(fTitle);

      // question text
      var f1 = document.createElement('div'); f1.className = 'field';
      var l1 = document.createElement('label'); l1.textContent = 'Question text';
      var ta = document.createElement('textarea'); ta.rows = 2; ta.value = node.text || '';
      ta.oninput = function(){ node.text = ta.value; };
      ta.onblur = function(){ render(); };
      f1.appendChild(l1); f1.appendChild(ta);
      panel.appendChild(f1);

      // options
      var f2 = document.createElement('div'); f2.className = 'field';
      var l2 = document.createElement('label'); l2.textContent = 'Answer options → next node';
      f2.appendChild(l2);

      (node.options||[]).forEach(function(opt, idx){
        var row = document.createElement('div'); row.className = 'option-row';

        var labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.placeholder = 'Answer label';
        labelInput.value = opt.label || '';
        labelInput.oninput = function(){ opt.label = labelInput.value; };

        var select = document.createElement('select');
        var blankOpt = document.createElement('option');
        blankOpt.value = ''; blankOpt.textContent = '— choose target —';
        select.appendChild(blankOpt);
        nodeList().forEach(function(n){
          if(n.id === node.id) return;
          var o = document.createElement('option');
          o.value = n.id;
          o.textContent = n.id + ' · ' + shortLabel(n);
          if(opt.nextId === n.id) o.selected = true;
          select.appendChild(o);
        });
        var newOpt = document.createElement('option');
        newOpt.value = '__new__';
        newOpt.textContent = '+ Create new node';
        select.appendChild(newOpt);
        select.onchange = function(){
          if(select.value === '__new__'){
            var nn = uid('q');
            tree.nodes[nn] = { id:nn, type:'question', text:'New question', options:[] };
            opt.nextId = nn;
            render();
          } else {
            opt.nextId = select.value;
          }
        };

        var del = document.createElement('button');
        del.className = 'btn small danger';
        del.textContent = '✕';
        del.onclick = function(){ node.options.splice(idx,1); render(); };

        row.appendChild(labelInput);
        row.appendChild(select);
        row.appendChild(del);
        f2.appendChild(row);
      });

      var addOpt = document.createElement('button');
      addOpt.className = 'btn small add-option-btn';
      addOpt.textContent = '+ Add answer option';
      addOpt.onclick = function(){
        node.options = node.options || [];
        node.options.push({label:'', nextId:''});
        render();
      };
      f2.appendChild(addOpt);
      panel.appendChild(f2);

    } else {
      // outcome node
      var f3 = document.createElement('div'); f3.className = 'field';
      var l3 = document.createElement('label'); l3.textContent = 'Outcome type';
      var row3 = document.createElement('div'); row3.className = 'outcome-type-row';
      [['success','Resolved'],['neutral','Escalate'],['fail','Unresolved']].forEach(function(pair){
        var b = document.createElement('button');
        b.textContent = pair[1];
        b.className = (node.outcomeType === pair[0] ? 'active ' + pair[0] : '');
        b.onclick = function(){ node.outcomeType = pair[0]; render(); };
        row3.appendChild(b);
      });
      f3.appendChild(l3); f3.appendChild(row3);
      panel.appendChild(f3);

      var f4 = document.createElement('div'); f4.className = 'field';
      var l4 = document.createElement('label'); l4.textContent = 'Resolution text';
      var ta2 = document.createElement('textarea'); ta2.rows = 4; ta2.value = node.resolution || '';
      ta2.oninput = function(){ node.resolution = ta2.value; };
      f4.appendChild(l4); f4.appendChild(ta2);
      panel.appendChild(f4);
    }

    // footer actions
    var footer = document.createElement('div');
    footer.className = 'node-footer-actions';

    var left = document.createElement('div');
    if(node.id !== tree.rootId){
      var setRoot = document.createElement('button');
      setRoot.className = 'btn small';
      setRoot.textContent = 'Set as start node';
      setRoot.onclick = function(){ tree.rootId = node.id; render(); };
      left.appendChild(setRoot);
    }

    var delNode = document.createElement('button');
    delNode.className = 'btn small danger';
    delNode.textContent = 'Delete node';
    delNode.onclick = function(){ deleteNode(node.id); };

    footer.appendChild(left);
    footer.appendChild(delNode);
    panel.appendChild(footer);

    return panel;
  }

  // ---------- play mode ----------
  function resetPlay(){
    playPath = [];
    playCurrentId = tree.rootId;
  }

  function traceSVG(){
    var wrap = document.createElement('div');
    wrap.className = 'trace-wrap';
    var steps = playPath.concat([{nodeId:playCurrentId}]);
    var spacing = 130, r = 8, y = 20, leftPad = 48, w = Math.max(steps.length * spacing + 40 + (leftPad-30), 200);
    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','trace-svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', 46);
    svg.setAttribute('viewBox','0 0 ' + w + ' 46');

    steps.forEach(function(step, i){
      var cx = leftPad + i*spacing;
      if(i > 0){
        var line = document.createElementNS('http://www.w3.org/2000/svg','line');
        line.setAttribute('x1', leftPad + (i-1)*spacing + r);
        line.setAttribute('y1', y);
        line.setAttribute('x2', cx - r);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', '#D00000');
        line.setAttribute('stroke-width', '2');
        svg.appendChild(line);
      }
      var n = tree.nodes[step.nodeId];
      var fill = '#D00000';
      if(n && n.type === 'outcome'){
        fill = n.outcomeType === 'success' ? '#1E7A4C' : n.outcomeType === 'fail' ? '#8C1414' : '#5B6167';
      } else if(i < steps.length - 1){
        fill = '#1C1E21';
      }
      var circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', fill);
      svg.appendChild(circle);

      if(i < playPath.length){
        var label = document.createElementNS('http://www.w3.org/2000/svg','text');
        label.setAttribute('x', cx);
        label.setAttribute('y', y + 24);
        label.setAttribute('text-anchor','middle');
        label.setAttribute('font-family','IBM Plex Mono, monospace');
        label.setAttribute('font-size','9');
        label.setAttribute('fill','#4A5D68');
        var lbl = (playPath[i].label || '').slice(0,14);
        label.textContent = lbl + ((playPath[i].label||'').length>14?'…':'');
        svg.appendChild(label);
      }
    });
    wrap.appendChild(svg);
    return wrap;
  }

  function renderPlaySingleColumn(){
    var col = document.createElement('div');

    if(!tree.rootId || !tree.nodes[tree.rootId]){
      var warn = document.createElement('div');
      warn.className = 'no-root-warning';
      warn.textContent = 'This tree has no start node set. Go to Build, select a node, and click "Set as start node".';
      col.appendChild(warn);
      return col;
    }

    if(playCurrentId === null){ resetPlay(); }
    col.appendChild(traceSVG());

    if(playPath.length > 0){
      var topBackRow = document.createElement('div');
      topBackRow.className = 'play-back-row-top';
      var topBack = document.createElement('button');
      topBack.className = 'btn';
      topBack.textContent = '← Back one step';
      topBack.onclick = function(){
        var last = playPath.pop();
        playCurrentId = last.nodeId;
        render();
      };
      topBackRow.appendChild(topBack);
      col.appendChild(topBackRow);
    }

    var node = tree.nodes[playCurrentId];
    var card = document.createElement('div');
    card.className = 'play-card';
    var body = document.createElement('div');
    body.className = 'play-card-body';

    if(!node){
      var missing = document.createElement('div');
      missing.className = 'no-root-warning';
      missing.textContent = 'This path points to a node that no longer exists.';
      body.appendChild(missing);
    } else if(node.type === 'question'){
      var eyebrow = document.createElement('div');
      eyebrow.className = 'play-eyebrow';
      eyebrow.textContent = 'Step ' + (playPath.length + 1);
      body.appendChild(eyebrow);

      if(node.title){
        var qTitle = document.createElement('div');
        qTitle.className = 'play-title';
        qTitle.textContent = node.title;
        body.appendChild(qTitle);
      }

      if(node.image){
        var img = document.createElement('img');
        img.className = 'play-image';
        img.src = node.image;
        body.appendChild(img);
      }

      if(node.text){
        var q = document.createElement('div');
        q.className = 'play-question';
        q.textContent = node.text;
        body.appendChild(q);
      }

      var opts = document.createElement('div');
      opts.className = 'play-options';
      (node.options||[]).forEach(function(opt){
        var b = document.createElement('button');
        b.className = 'play-option-btn';
        b.textContent = opt.label || '(unlabeled option)';
        b.disabled = !opt.nextId;
        b.onclick = function(){
          playPath.push({nodeId:node.id, label:opt.label});
          playCurrentId = opt.nextId;
          render();
        };
        opts.appendChild(b);
      });
      if(!(node.options||[]).length){
        var noOpts = document.createElement('div');
        noOpts.className = 'empty-hint';
        noOpts.textContent = 'This question has no answer options yet — add some in Build mode.';
        opts.appendChild(noOpts);
      }
      body.appendChild(opts);

    } else {
      var banner = document.createElement('div');
      banner.className = 'outcome-banner ' + (node.outcomeType || 'neutral');
      banner.textContent = node.outcomeType === 'success' ? 'Resolved' : node.outcomeType === 'fail' ? 'Unresolved' : 'Escalate';
      body.appendChild(banner);

      if(node.image){
        var img2 = document.createElement('img');
        img2.className = 'play-image';
        img2.src = node.image;
        body.appendChild(img2);
      }

      var res = document.createElement('div');
      res.className = 'play-resolution';
      res.textContent = node.resolution || '(no resolution text set)';
      body.appendChild(res);
    }

    card.appendChild(body);

    var backRow = document.createElement('div');
    backRow.className = 'play-back-row';
    if(playPath.length > 0){
      var back = document.createElement('button');
      back.className = 'btn';
      back.textContent = '← Back one step';
      back.onclick = function(){
        var last = playPath.pop();
        playCurrentId = last.nodeId;
        render();
      };
      backRow.appendChild(back);
    }
    var restart = document.createElement('button');
    restart.className = 'btn';
    restart.textContent = 'Start over';
    restart.onclick = function(){ resetPlay(); render(); };
    backRow.appendChild(restart);
    card.appendChild(backRow);

    col.appendChild(card);
    return col;
  }

  // ---------- toolbar wiring ----------
  document.getElementById('tabBuild').onclick = function(){ mode='build'; render(); };
  document.getElementById('tabPlay').onclick = function(){ mode='play'; resetPlay(); render(); };

  document.getElementById('btnAddNode').onclick = function(){
    var id = uid('q');
    tree.nodes[id] = { id:id, type:'question', text:'New question', options:[] };
    selectedNodeId = id;
    mode = 'build';
    render();
  };

  document.getElementById('btnLoadSample').onclick = function(){
    if(!confirm('Load the sample tree? This replaces your current tree.')) return;
    tree = sampleTree();
    selectedNodeId = tree.rootId;
    mode = 'build';
    render();
  };

  document.getElementById('btnNewTree').onclick = function(){
    if(!confirm('Start a new blank tree? This replaces your current tree.')) return;
    tree = blankTree();
    selectedNodeId = tree.rootId;
    mode = 'build';
    render();
  };

  document.getElementById('btnExport').onclick = function(){
    var blob = new Blob([JSON.stringify(tree, null, 2)], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'decision-tree.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  document.getElementById('btnImport').onclick = function(){
    document.getElementById('fileInput').click();
  };
  document.getElementById('fileInput').onchange = function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var parsed = JSON.parse(reader.result);
        if(!parsed.nodes || !parsed.rootId) throw new Error('missing nodes/rootId');
        tree = parsed;
        selectedNodeId = tree.rootId;
        mode = 'build';
        render();
      }catch(err){
        alert('Could not import this file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Reads a fetched image response and resolves with a base64 data URI,
  // since the standalone export must not depend on any external file.
  function blobToDataURL(blob){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  document.getElementById('btnExportPlayer').onclick = function(){
    var exportBtn = document.getElementById('btnExportPlayer');
    var originalLabel = exportBtn.textContent;
    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporting…';

    var titleText = document.querySelector('.brand-text h1').textContent;
    var treeJson = JSON.stringify(tree).replace(/<\/script/gi, '<\\/script');

    Promise.all([
      fetch('styles.css').then(function(r){
        if(!r.ok) throw new Error('could not load styles.css');
        return r.text();
      }),
      fetch('logo.png').then(function(r){
        if(!r.ok) throw new Error('could not load logo.png');
        return r.blob();
      }).then(blobToDataURL)
    ]).then(function(results){
      var cssText = results[0];
      var logoSrc = results[1];

      var playerScript = [
        'var tree = ' + treeJson + ';',
        'var playPath = [];',
        'var playCurrentId = null;',
        '',
        'function resetPlay(){',
        '  playPath = [];',
        '  playCurrentId = tree.rootId;',
        '}',
        '',
        'function traceSVG(){',
        '  var wrap = document.createElement("div");',
        '  wrap.className = "trace-wrap";',
        '  var steps = playPath.concat([{nodeId:playCurrentId}]);',
        '  var spacing = 130, r = 8, y = 20, leftPad = 48, w = Math.max(steps.length * spacing + 40 + (leftPad-30), 200);',
        '  var svg = document.createElementNS("http://www.w3.org/2000/svg","svg");',
        '  svg.setAttribute("class","trace-svg");',
        '  svg.setAttribute("width", w);',
        '  svg.setAttribute("height", 46);',
        '  svg.setAttribute("viewBox","0 0 " + w + " 46");',
        '  steps.forEach(function(step, i){',
        '    var cx = leftPad + i*spacing;',
        '    if(i > 0){',
        '      var line = document.createElementNS("http://www.w3.org/2000/svg","line");',
        '      line.setAttribute("x1", leftPad + (i-1)*spacing + r);',
        '      line.setAttribute("y1", y);',
        '      line.setAttribute("x2", cx - r);',
        '      line.setAttribute("y2", y);',
        '      line.setAttribute("stroke", "#D00000");',
        '      line.setAttribute("stroke-width", "2");',
        '      svg.appendChild(line);',
        '    }',
        '    var n = tree.nodes[step.nodeId];',
        '    var fill = "#D00000";',
        '    if(n && n.type === "outcome"){',
        '      fill = n.outcomeType === "success" ? "#1E7A4C" : n.outcomeType === "fail" ? "#8C1414" : "#5B6167";',
        '    } else if(i < steps.length - 1){',
        '      fill = "#1C1E21";',
        '    }',
        '    var circle = document.createElementNS("http://www.w3.org/2000/svg","circle");',
        '    circle.setAttribute("cx", cx);',
        '    circle.setAttribute("cy", y);',
        '    circle.setAttribute("r", r);',
        '    circle.setAttribute("fill", fill);',
        '    svg.appendChild(circle);',
        '    if(i < playPath.length){',
        '      var label = document.createElementNS("http://www.w3.org/2000/svg","text");',
        '      label.setAttribute("x", cx);',
        '      label.setAttribute("y", y + 24);',
        '      label.setAttribute("text-anchor","middle");',
        '      label.setAttribute("font-family","IBM Plex Mono, monospace");',
        '      label.setAttribute("font-size","9");',
        '      label.setAttribute("fill","#4A5D68");',
        '      var lbl = (playPath[i].label || "").slice(0,14);',
        '      label.textContent = lbl + ((playPath[i].label||"").length>14?"…":"");',
        '      svg.appendChild(label);',
        '    }',
        '  });',
        '  wrap.appendChild(svg);',
        '  return wrap;',
        '}',
        '',
        'function renderPlaySingleColumn(){',
        '  var col = document.createElement("div");',
        '  if(!tree.rootId || !tree.nodes[tree.rootId]){',
        '    var warn = document.createElement("div");',
        '    warn.className = "no-root-warning";',
        '    warn.textContent = "This guide has no content yet.";',
        '    col.appendChild(warn);',
        '    return col;',
        '  }',
        '  if(playCurrentId === null){ resetPlay(); }',
        '  col.appendChild(traceSVG());',
        '  if(playPath.length > 0){',
        '    var topBackRow = document.createElement("div");',
        '    topBackRow.className = "play-back-row-top";',
        '    var topBack = document.createElement("button");',
        '    topBack.className = "btn";',
        '    topBack.textContent = "← Back one step";',
        '    topBack.onclick = function(){',
        '      var last = playPath.pop();',
        '      playCurrentId = last.nodeId;',
        '      render();',
        '    };',
        '    topBackRow.appendChild(topBack);',
        '    col.appendChild(topBackRow);',
        '  }',
        '  var node = tree.nodes[playCurrentId];',
        '  var card = document.createElement("div");',
        '  card.className = "play-card";',
        '  var body = document.createElement("div");',
        '  body.className = "play-card-body";',
        '  if(!node){',
        '    var missing = document.createElement("div");',
        '    missing.className = "no-root-warning";',
        '    missing.textContent = "This path points to a step that no longer exists.";',
        '    body.appendChild(missing);',
        '  } else if(node.type === "question"){',
        '    var eyebrow = document.createElement("div");',
        '    eyebrow.className = "play-eyebrow";',
        '    eyebrow.textContent = "Step " + (playPath.length + 1);',
        '    body.appendChild(eyebrow);',
        '    if(node.title){',
        '      var qTitle = document.createElement("div");',
        '      qTitle.className = "play-title";',
        '      qTitle.textContent = node.title;',
        '      body.appendChild(qTitle);',
        '    }',
        '    if(node.image){',
        '      var img = document.createElement("img");',
        '      img.className = "play-image";',
        '      img.src = node.image;',
        '      body.appendChild(img);',
        '    }',
        '    if(node.text){',
        '      var q = document.createElement("div");',
        '      q.className = "play-question";',
        '      q.textContent = node.text;',
        '      body.appendChild(q);',
        '    }',
        '    var opts = document.createElement("div");',
        '    opts.className = "play-options";',
        '    (node.options||[]).forEach(function(opt){',
        '      var b = document.createElement("button");',
        '      b.className = "play-option-btn";',
        '      b.textContent = opt.label || "(unlabeled option)";',
        '      b.disabled = !opt.nextId;',
        '      b.onclick = function(){',
        '        playPath.push({nodeId:node.id, label:opt.label});',
        '        playCurrentId = opt.nextId;',
        '        render();',
        '      };',
        '      opts.appendChild(b);',
        '    });',
        '    body.appendChild(opts);',
        '  } else {',
        '    var banner = document.createElement("div");',
        '    banner.className = "outcome-banner " + (node.outcomeType || "neutral");',
        '    banner.textContent = node.outcomeType === "success" ? "Resolved" : node.outcomeType === "fail" ? "Unresolved" : "Escalate";',
        '    body.appendChild(banner);',
        '    if(node.image){',
        '      var img2 = document.createElement("img");',
        '      img2.className = "play-image";',
        '      img2.src = node.image;',
        '      body.appendChild(img2);',
        '    }',
        '    var res = document.createElement("div");',
        '    res.className = "play-resolution";',
        '    res.textContent = node.resolution || "";',
        '    body.appendChild(res);',
        '  }',
        '  card.appendChild(body);',
        '  var backRow = document.createElement("div");',
        '  backRow.className = "play-back-row";',
        '  if(playPath.length > 0){',
        '    var back = document.createElement("button");',
        '    back.className = "btn";',
        '    back.textContent = "← Back one step";',
        '    back.onclick = function(){',
        '      var last = playPath.pop();',
        '      playCurrentId = last.nodeId;',
        '      render();',
        '    };',
        '    backRow.appendChild(back);',
        '  }',
        '  var restart = document.createElement("button");',
        '  restart.className = "btn";',
        '  restart.textContent = "Start over";',
        '  restart.onclick = function(){ resetPlay(); render(); };',
        '  backRow.appendChild(restart);',
        '  card.appendChild(backRow);',
        '  col.appendChild(card);',
        '  return col;',
        '}',
        '',
        'function render(){',
        '  var layout = document.getElementById("layout");',
        '  layout.innerHTML = "";',
        '  layout.appendChild(renderPlaySingleColumn());',
        '}',
        '',
        'resetPlay();',
        'render();'
      ].join('\n');

      var doc = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<title>' + titleText + '</title>\n' +
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
        '<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">\n' +
        '<style>\n' + cssText + '\n</style>\n</head>\n<body>\n' +
        '<div class="app" id="appRoot">\n' +
        '  <header class="masthead">\n' +
        '    <div class="masthead-inner">\n' +
        '      <div class="brand">\n' +
        '        <img src="' + logoSrc + '" alt="CaptiveAire" />\n' +
        '        <div class="divider"></div>\n' +
        '        <div class="brand-text">\n' +
        '          <div class="eyebrow">Field Diagnostics</div>\n' +
        '          <h1>' + titleText + '</h1>\n' +
        '        </div>\n' +
        '      </div>\n' +
        '    </div>\n' +
        '  </header>\n' +
        '  <div id="layout" class="layout layout-play"></div>\n' +
        '</div>\n' +
        '<script>\n' + playerScript + '\n</' + 'script>\n' +
        '</body>\n</html>';

      var blob = new Blob([doc], {type:'text/html'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'paragon-troubleshooting-guide-player.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }).catch(function(err){
      alert('Could not export standalone file: ' + err.message);
    }).then(function(){
      exportBtn.disabled = false;
      exportBtn.textContent = originalLabel;
    });
  };

  // ---------- init ----------
  tree = sampleTree();
  selectedNodeId = tree.rootId;
  render();

})();
