// 모의매매 계산 (외부 라이브러리 없음). 실제 주문 없이 지금 가격으로 체결했다고 가정한다.
//
// 포지션: { quantity, avgPrice, realizedPnlUsdt, openedAt }
// realizedPnlUsdt 에는 수수료가 이미 빠져 있다 (매수 수수료도 확정 손실로 처리).

const DUST = 1e-12;

export function emptyPosition() {
  return { quantity: 0, avgPrice: 0, realizedPnlUsdt: 0, openedAt: null };
}

export function applyBuy(position, { price, quoteAmountUsdt, feeRate, now = Date.now() }) {
  if (!(price > 0)) throw new Error('가격이 올바르지 않아요.');
  if (!(quoteAmountUsdt > 0)) throw new Error('매수 금액이 올바르지 않아요.');
  const pos = { ...emptyPosition(), ...position };
  const quantity = quoteAmountUsdt / price;
  const feeUsdt = quoteAmountUsdt * feeRate;
  const newQty = pos.quantity + quantity;

  return {
    position: {
      ...pos,
      quantity: newQty,
      avgPrice: (pos.avgPrice * pos.quantity + price * quantity) / newQty,
      realizedPnlUsdt: pos.realizedPnlUsdt - feeUsdt,
      openedAt: pos.quantity > DUST && pos.openedAt ? pos.openedAt : now,
    },
    trade: { side: 'buy', price, quantity, quoteAmountUsdt, feeUsdt, realizedPnlUsdt: null },
  };
}

// quantity 가 null 이면 전량
export function applySell(position, { price, quantity = null, feeRate }) {
  if (!(price > 0)) throw new Error('가격이 올바르지 않아요.');
  const pos = { ...emptyPosition(), ...position };
  if (pos.quantity <= DUST) throw new Error('보유 수량이 없어요.');
  const qty = quantity == null ? pos.quantity : Math.min(quantity, pos.quantity);
  if (!(qty > 0)) throw new Error('매도 수량이 올바르지 않아요.');

  const quoteAmountUsdt = qty * price;
  const feeUsdt = quoteAmountUsdt * feeRate;
  const pnl = (price - pos.avgPrice) * qty - feeUsdt;
  let remaining = pos.quantity - qty;
  if (remaining <= DUST * Math.max(1, pos.quantity)) remaining = 0;

  return {
    position: {
      ...pos,
      quantity: remaining,
      avgPrice: remaining === 0 ? 0 : pos.avgPrice,
      realizedPnlUsdt: pos.realizedPnlUsdt + pnl,
      openedAt: remaining === 0 ? null : pos.openedAt,
    },
    trade: { side: 'sell', price, quantity: qty, quoteAmountUsdt, feeUsdt, realizedPnlUsdt: pnl },
  };
}

// 모의 가상 현금 = 시작 자금 + 확정 손익 − 보유분 매입금액
export function paperCash(startCapital, positions) {
  return positions.reduce(
    (cash, p) => cash + Number(p.realizedPnlUsdt || 0) - Number(p.avgPrice || 0) * Number(p.quantity || 0),
    startCapital,
  );
}
