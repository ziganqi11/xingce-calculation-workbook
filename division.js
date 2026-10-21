/* Exact long-division digits drive both the teaching text and the visual rows. */
function buildLongDivision(numerator, denominator, precision = 0) {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error('竖式演示需要非负整数和正整数除数');
  }
  const digits = String(numerator);
  const decimals = Math.min(5, Math.max(2, Math.trunc(precision) + 1));
  const steps = [];
  let remainder = 0, quotient = '', startPosition = 0, started = false;
  for (let position = 0; position < digits.length; position++) {
    const partial = remainder * 10 + Number(digits[position]);
    if (!started && partial < denominator && position < digits.length - 1) {
      remainder = partial;
      continue;
    }
    if (!started) { started = true; startPosition = position; }
    const digit = Math.floor(partial / denominator);
    const product = digit * denominator;
    remainder = partial - product;
    quotient += String(digit);
    steps.push({
      position, partial, digit, product, remainder, quotient,
      explanation: steps.length === 0
        ? `从左取前 ${position + 1} 位得到 ${partial}，试商 ${digit}；${digit} × ${denominator} = ${product}，余 ${remainder}。`
        : `落下 ${digits[position]} 得到 ${partial}，这一位商 ${digit}；减去 ${product}，余 ${remainder}。`
    });
  }
  let decimalCount = 0;
  for (let index = 0; index < decimals && remainder !== 0; index++) {
    const previous = remainder;
    const partial = remainder * 10;
    const digit = Math.floor(partial / denominator);
    const product = digit * denominator;
    remainder = partial - product;
    quotient += `${index === 0 ? '.' : ''}${digit}`;
    decimalCount++;
    steps.push({
      position: digits.length + index + 1, partial, digit, product, remainder, quotient,
      explanation: `余数 ${previous} 后补 0 得到 ${partial}，小数这一位商 ${digit}；减去 ${product}，余 ${remainder}。`
    });
  }
  return {
    numerator, denominator, steps, startPosition, quotient, remainder,
    dividend: digits + (decimalCount ? `.${'0'.repeat(decimalCount)}` : ''),
    decimalCount
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildLongDivision };

if (typeof window !== 'undefined' && window.document) {
  const $ = id => document.getElementById(id);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = null, timer = null, shown = 0, paused = false, trigger = null;
  const align = (value, position) => `${' '.repeat(Math.max(0, position + 1 - String(value).length))}${value}`;

  function stopTimer() { if (timer) clearTimeout(timer); timer = null; }
  function updateControls() {
    const done = !current || shown >= current.steps.length;
    $('division-pause').textContent = done ? '已完成' : paused ? '继续播放' : '暂停';
    $('division-pause').disabled = done;
    $('division-next').disabled = done;
    $('division-progress-fill').style.width = current ? `${shown / current.steps.length * 100}%` : '0%';
    $('division-step-counter').textContent = current ? `第 ${shown} / ${current.steps.length} 步` : '准备开始';
  }
  function advance() {
    if (!current || shown >= current.steps.length) return;
    const step = current.steps[shown];
    const row = $('division-board').querySelector(`[data-division-step="${shown}"]`);
    row.hidden = false;
    row.classList.add('appeared');
    shown++;
    $('division-quotient').textContent = `${' '.repeat(current.startPosition)}${step.quotient}`;
    $('division-narration').textContent = shown === current.steps.length
      ? `${step.explanation} 竖式商约 ${current.quotient}；本题按设定精度的参考答案是 ${current.answer}。`
      : step.explanation;
    updateControls();
    const stage = $('division-stage');
    stage.scrollTo({ top: stage.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  function schedule() {
    stopTimer();
    if (paused || !current || shown >= current.steps.length) return;
    timer = setTimeout(() => { advance(); schedule(); }, shown === 0 ? 450 : 1550);
  }
  function replay() {
    if (!current) return;
    stopTimer(); shown = 0; paused = false;
    $('division-board').querySelectorAll('[data-division-step]').forEach(row => { row.hidden = true; row.classList.remove('appeared'); });
    $('division-quotient').textContent = '';
    $('division-narration').textContent = `从 ${current.numerator} 的高位开始试商，每一步会写出乘积和余数。`;
    $('division-stage').scrollTop = 0;
    updateControls(); schedule();
  }
  function close() {
    stopTimer(); current = null;
    $('division-overlay').hidden = true;
    document.body.classList.remove('demo-open');
    trigger?.focus(); trigger = null;
  }
  function open(question, settings = {}) {
    if (!question?.division) return;
    const { numerator, denominator } = question.division;
    const built = buildLongDivision(numerator, denominator, Number(settings.precision) || 0);
    current = { ...built, answer: question.answer };
    trigger = document.activeElement;
    $('division-expression').textContent = `${numerator} ÷ ${denominator}`;
    const rows = built.steps.map((step, index) => `
      <div class="division-row" data-division-step="${index}" hidden>
        <div class="division-partial">${align(step.partial, step.position)}</div>
        <div class="division-product"><span>${align(step.product, step.position)}</span></div>
        <div class="division-remainder">${align(step.remainder, step.position)}</div>
      </div>`).join('');
    $('division-board').innerHTML = `<div class="division-math">
      <div id="division-quotient" class="division-quotient"></div>
      <div class="division-divisor">${denominator}</div>
      <div class="division-dividend">${built.dividend}</div>
      <div class="division-rows">${rows}</div>
    </div>`;
    $('division-overlay').hidden = false;
    document.body.classList.add('demo-open');
    $('division-close').focus();
    replay();
  }
  $('division-close').addEventListener('click', close);
  $('division-overlay').addEventListener('click', event => { if (event.target === $('division-overlay')) close(); });
  $('division-replay').addEventListener('click', replay);
  $('division-pause').addEventListener('click', () => { paused = !paused; updateControls(); schedule(); });
  $('division-next').addEventListener('click', () => { stopTimer(); advance(); schedule(); });
  document.addEventListener('keydown', event => {
    if ($('division-overlay').hidden) return;
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...$('division-overlay').querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.LongDivisionDemo = { open, close, build: buildLongDivision };
}
