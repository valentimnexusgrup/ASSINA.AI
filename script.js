const SUPABASE_URL = 'https://mjrmbpyfcqqnajgtooob.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_31BnfsJvwNhjc50QT89Q9Q_15EFurOW';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(function(){
  const form = document.getElementById('signForm');
  const submitBtn = document.getElementById('submitBtn');
  const statusMsg = document.getElementById('statusMsg');
  const ledgerEl = document.getElementById('ledger');
  const ledgerSub = document.getElementById('ledgerSub');
  const counterNumber = document.getElementById('counterNumber');
  const counterLabel = document.getElementById('counterLabel');

  const nomeInput = document.getElementById('nome');
  const cpfInput = document.getElementById('cpf');
  const telInput = document.getElementById('telefone');
  const consentInput = document.getElementById('consent');
  const exportBtn = document.getElementById('exportBtn');

  let currentEntries = [];

  function formatCpfDisplay(digits){
    if(!digits || digits.length !== 11) return digits || '';
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  function formatTelDisplay(digits){
    if(!digits) return '';
    if(digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if(digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return digits;
  }

  function maskCpf(v){
    v = v.replace(/\D/g,'').slice(0,11);
    if(v.length > 9) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    if(v.length > 6) return v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if(v.length > 3) return v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    return v;
  }
  function maskTel(v){
    v = v.replace(/\D/g,'').slice(0,11);
    if(v.length > 6) return v.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');
    if(v.length > 2) return v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    return v;
  }
  cpfInput.addEventListener('input', e => { e.target.value = maskCpf(e.target.value); });
  telInput.addEventListener('input', e => { e.target.value = maskTel(e.target.value); });

  function clearErrors(){
    ['fieldNome','fieldCpf','fieldTelefone'].forEach(id => {
      document.getElementById(id).classList.remove('error');
    });
  }

  function validate(){
    clearErrors();
    let ok = true;
    if(nomeInput.value.trim().length < 5 || !nomeInput.value.trim().includes(' ')){
      document.getElementById('fieldNome').classList.add('error');
      ok = false;
    }
    const cpfDigits = cpfInput.value.replace(/\D/g,'');
    if(cpfDigits.length !== 11){
      document.getElementById('fieldCpf').classList.add('error');
      ok = false;
    }
    const telDigits = telInput.value.replace(/\D/g,'');
    if(telDigits.length < 10){
      document.getElementById('fieldTelefone').classList.add('error');
      ok = false;
    }
    return ok;
  }

  async function loadEntries(){
    try{
      const { data, error } = await supabase
        .from('assinaturas_publicas')
        .select('nome, criado_em')
        .order('nome', { ascending: true });

      if(error) throw error;
      return (data || []).map(e => ({ nome: e.nome, data: e.criado_em }));
    }catch(err){
      console.error('Erro ao carregar assinaturas:', err);
      return [];
    }
  }

  async function submitEntry(payload){
    try{
      const { error } = await supabase
        .from('assinaturas')
        .insert([{ nome: payload.nome, cpf: payload.cpf, telefone: payload.telefone }]);

      if(error){
        if(error.code === '23505'){
          return { ok: false, error: 'duplicate' };
        }
        throw error;
      }
      return { ok: true };
    }catch(err){
      console.error('Erro ao enviar assinatura:', err);
      return { ok: false, error: 'server' };
    }
  }

  async function loadFullEntries(key){
    const { data, error } = await supabase.rpc('exportar_assinaturas', { senha: key });
    if(error) throw new Error(error.message || 'unauthorized');
    return (data || []).map(e => ({
      nome: e.nome,
      cpf: e.cpf,
      telefone: e.telefone,
      data: e.criado_em
    }));
  }

  function formatDate(iso){
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' });
  }

  function renderLedger(entries, highlightLast){
    currentEntries = entries;
    exportBtn.disabled = entries.length === 0;
    counterNumber.textContent = entries.length;
    counterLabel.textContent = entries.length === 1
      ? 'pessoa já assinou este documento'
      : 'pessoas já assinaram este documento';

    if(entries.length === 0){
      ledgerEl.innerHTML = '<div class="ledger-empty">Nenhuma assinatura ainda. Seja o primeiro a assinar.</div>';
      return;
    }

    ledgerEl.innerHTML = '';
    entries.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'ledger-row';
      if(highlightLast && i === entries.length - 1) row.classList.add('new');
      const num = String(i + 1).padStart(3, '0');
      row.innerHTML =
        '<span class="ledger-num">' + num + '</span>' +
        '<span class="ledger-name">' + escapeHtml(entry.nome) + '</span>' +
        '<span class="ledger-date">' + formatDate(entry.data) + '</span>';
      ledgerEl.appendChild(row);
    });
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function init(){
    const entries = await loadEntries();
    renderLedger(entries, false);
  }

  function generatePdf(entriesForPdf){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 48;
    let y = 56;

    const now = new Date();
    const generatedAt = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR');

    doc.setFont('times', 'bold');
    doc.setFontSize(15);
    doc.text('ABAIXO-ASSINADO DA COMUNIDADE', pageWidth / 2, y, { align: 'center' });
    y += 20;
    doc.setFont('times', 'italic');
    doc.setFontSize(11.5);
    doc.text('Em defesa da finalidade do cemitério destinado à comunidade', pageWidth / 2, y, { align: 'center' });
    y += 28;

    const manifestoParas = [
      'Nós, moradores e membros da comunidade abaixo-assinados, por meio deste documento, manifestamos nossa insatisfação e discordância quanto à utilização do cemitério comunitário para sepultamento de pessoas que não pertencem à comunidade ou à região.',
      'O referido terreno foi doado por um morador da comunidade com a finalidade de servir ao próprio povo da região, como espaço destinado ao sepultamento de seus moradores e familiares. Por esse motivo, solicitamos que seja respeitada a finalidade para a qual o terreno foi doado, preservando o direito da comunidade de decidir sobre a utilização desse espaço.',
      'Dessa forma, a comunidade manifesta seu posicionamento contrário à realização de sepultamentos de pessoas provenientes de outras localidades, quando isso não estiver de acordo com a finalidade originalmente destinada ao cemitério.',
      'Solicitamos às autoridades e aos responsáveis que ouçam a comunidade, respeitem a finalidade do espaço e adotem as providências necessárias para garantir que o cemitério continue atendendo aos interesses dos moradores da região.'
    ];
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    manifestoParas.forEach(p => {
      const lines = doc.splitTextToSize(p, pageWidth - marginX * 2);
      doc.text(lines, marginX, y);
      y += lines.length * 13 + 8;
    });

    y += 6;
    doc.setDrawColor(168, 130, 60);
    doc.setLineWidth(0.8);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Registro de assinaturas — Total: ' + entriesForPdf.length, marginX, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 100, 85);
    doc.text('Documento gerado automaticamente em ' + generatedAt + ' a partir do registro digital do abaixo-assinado.', marginX, y + 12);
    doc.setTextColor(0, 0, 0);
    y += 30;

    const colX = { num: marginX, nome: marginX + 34, cpf: marginX + 240, tel: marginX + 355, data: pageWidth - marginX - 55 };
    function drawHeader(){
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Nº', colX.num, y);
      doc.text('NOME', colX.nome, y);
      doc.text('CPF', colX.cpf, y);
      doc.text('TELEFONE', colX.tel, y);
      doc.text('DATA', colX.data, y);
      y += 6;
      doc.setDrawColor(200, 190, 165);
      doc.setLineWidth(0.5);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
    }
    drawHeader();

    entriesForPdf.forEach((entry, i) => {
      if(y > pageHeight - 60){
        doc.addPage();
        y = 56;
        drawHeader();
      }
      const d = new Date(entry.data);
      const dataStr = d.toLocaleDateString('pt-BR');
      doc.setFontSize(9);
      doc.text(String(i + 1).padStart(3, '0'), colX.num, y);
      doc.text(entry.nome.length > 34 ? entry.nome.slice(0,34) + '…' : entry.nome, colX.nome, y);
      doc.text(formatCpfDisplay(entry.cpf), colX.cpf, y);
      doc.text(formatTelDisplay(entry.telefone), colX.tel, y);
      doc.text(dataStr, colX.data, y);
      y += 16;
    });

    const totalPages = doc.internal.getNumberOfPages();
    for(let p = 1; p <= totalPages; p++){
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(140, 130, 110);
      doc.text('Página ' + p + ' de ' + totalPages, pageWidth - marginX, pageHeight - 30, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }

    const filename = 'abaixo-assinado-cemiterio-' + now.toISOString().slice(0,10) + '.pdf';
    doc.save(filename);
  }

  exportBtn.addEventListener('click', async function(){
    if(currentEntries.length === 0) return;
    const key = window.prompt('Senha de exportação (CPF e telefone só aparecem no PDF com a senha correta):');
    if(!key) return;
    exportBtn.disabled = true;
    exportBtn.textContent = 'Gerando...';
    try{
      const fullEntries = await loadFullEntries(key);
      generatePdf(fullEntries);
    }catch(err){
      alert('Senha incorreta ou erro ao buscar os dados.');
    }finally{
      exportBtn.disabled = currentEntries.length === 0;
      exportBtn.textContent = 'Baixar registro em PDF';
    }
  });

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    statusMsg.textContent = '';
    statusMsg.className = 'status-msg';

    if(!validate()){
      statusMsg.textContent = 'Confira os campos destacados.';
      statusMsg.classList.add('err');
      return;
    }
    if(!consentInput.checked){
      statusMsg.textContent = 'É necessário confirmar a autorização para registrar seus dados.';
      statusMsg.classList.add('err');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try{
      const cpfDigits = cpfInput.value.replace(/\D/g,'');
      const result = await submitEntry({
        nome: nomeInput.value.trim(),
        cpf: cpfDigits,
        telefone: telInput.value.replace(/\D/g,'')
      });

      if(!result.ok){
        statusMsg.textContent = result.error === 'duplicate'
          ? 'Este CPF já assinou o abaixo-assinado.'
          : 'Não foi possível registrar agora. Tente novamente.';
        statusMsg.classList.add('err');
        return;
      }

      const entries = await loadEntries();
      renderLedger(entries, true);

      statusMsg.textContent = 'Assinatura registrada. Obrigado por participar.';
      statusMsg.classList.add('ok');
      form.reset();
    }catch(err){
      statusMsg.textContent = 'Não foi possível registrar agora. Tente novamente.';
      statusMsg.classList.add('err');
    }finally{
      submitBtn.disabled = false;
      submitBtn.textContent = 'Assinar o abaixo-assinado';
    }
  });

  init();
})();