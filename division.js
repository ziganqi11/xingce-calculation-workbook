/* Complete, exact digit-by-digit division for the formal and subtraction views. */
function buildLongDivision(numerator, denominator, precision = 0) {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error('竖式需要非负整数被除数和正整数除数');
  }
  const digits = String(numerator);
  const desiredDecimals = Math.min(10, Math.max(3, Math.trunc(precision) + 2));
  const steps = [];
  let remainder = 0, quotient = '', startPosition = 0, started = false;
  for (let position = 0; position < digits.length; position++) {
    const partial = remainder * 10 + Number(digits[position]);
    if (!started && partial < denominator && position < digits.length - 1) {
      remainder = partial;
      continue;
    }
    if (!started) { started = true; startPosition = position; }
    const digit = Math.floor(partial / denominator), product = digit * denominator;
    remainder = partial - product;
    quotient += digit;
    steps.push({ position, partial, digit, product, remainder, exponent: digits.length - 1 - position });
  }
  let decimalCount = 0;
  while (decimalCount < desiredDecimals && remainder !== 0) {
    const partial = remainder * 10, digit = Math.floor(partial / denominator), product = digit * denominator;
    remainder = partial - product;
    quotient += `${decimalCount === 0 ? '.' : ''}${digit}`;
    steps.push({ position: digits.length + decimalCount + 1, partial, digit, product, remainder, exponent: -decimalCount - 1 });
    decimalCount++;
  }
  const scale = 10n ** BigInt(decimalCount);
  const fixed = value => {
    const raw = value.toString();
    if (decimalCount === 0) return raw;
    const padded = raw.padStart(decimalCount + 1, '0');
    return `${padded.slice(0, -decimalCount)}.${padded.slice(-decimalCount)}`;
  };
  let fullRemainder = BigInt(numerator) * scale;
  const trace = steps.map(step => {
    const before = fullRemainder;
    const quotientTerm = BigInt(step.digit) * (10n ** BigInt(step.exponent + decimalCount));
    const subtraction = BigInt(denominator) * quotientTerm;
    fullRemainder -= subtraction;
    return { before: fixed(before), subtraction: fixed(subtraction), after: fixed(fullRemainder), quotientTerm: fixed(quotientTerm) };
  });
  return {
    numerator, denominator, steps, trace, quotient, remainder, startPosition, decimalCount,
    dividend: digits + (decimalCount ? `.${'0'.repeat(decimalCount)}` : ''),
    finalRemainder: fixed(fullRemainder)
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildLongDivision };

if (typeof window !== 'undefined' && window.document) {
  const $ = id => document.getElementById(id);
  const align = (value, position) => `${' '.repeat(Math.max(0, position + 1 - String(value).length))}${value}`;
  let trigger = null;

  function close() {
    $('division-overlay').hidden = true;
    document.body.classList.remove('demo-open');
    trigger?.focus(); trigger = null;
  }

  function open(question, settings = {}) {
    if (question?.mode !== 'div53' || !question.division) return;
    const { numerator, denominator } = question.division;
    const built = buildLongDivision(numerator, denominator, Number(settings.precision) || 0);
    trigger = document.activeElement;
    $('division-expression').textContent = `${numerator} ÷ ${denominator}`;
    $('division-answer').textContent = `商 ${built.quotient} · 本题参考答案 ${question.answer}`;
    const rows = built.steps.map(step => `<div class="division-row">
      <div class="division-partial">${align(step.partial, step.position)}</div>
      <div class="division-product"><span>${align(step.product, step.position)}</span></div>
      <div class="division-remainder">${align(step.remainder, step.position)}</div>
    </div>`).join('');
    $('division-board').innerHTML = `<div class="division-math">
      <div class="division-quotient">${' '.repeat(built.startPosition)}${built.quotient}</div>
      <div class="division-divisor">${denominator}</div>
      <div class="division-dividend">${built.dividend}</div>
      <div class="division-rows">${rows}</div>
    </div>`;
    $('division-reverse').innerHTML = built.trace.map(part => `<div class="reverse-row">
      <div class="reverse-equation"><span>${part.before}</span><b>|</b><span>− ${part.subtraction}</span></div>
      <div class="reverse-result"><strong>${part.after}</strong><b>|</b><span>商位 ${part.quotientTerm}</span></div>
    </div>`).join('') + `<div class="reverse-final">最终余数 ${built.finalRemainder}</div>`;
    $('division-narration').textContent = `左侧是完整竖式；右侧把每个商位对应的乘积从当前数中减去。原始被除数 ${numerator}、除数 ${denominator} 均未截位；小数展示到 ${built.decimalCount} 位。`;
    $('division-overlay').hidden = false;
    document.body.classList.add('demo-open');
    $('division-close').focus();
  }

  $('division-close').addEventListener('click', close);
  $('division-overlay').addEventListener('click', event => { if (event.target === $('division-overlay')) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('division-overlay').hidden) close(); });
  window.LongDivisionDemo = { open, close, build: buildLongDivision };
}
