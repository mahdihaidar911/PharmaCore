/** What to return to the customer after subtracting the sale total from what they paid. */
export function computeChange(totalUsd: number, paidUsd: number, paidLbp: number, rate: number) {
  const totalLbp = Math.round(totalUsd * rate);
  const paidEquivalent = paidUsd + paidLbp / rate;
  const changeEquivalent = Math.max(0, paidEquivalent - totalUsd);

  if (changeEquivalent <= 0.01) {
    return { changeUsd: 0, changeLbp: 0, changeEquivalent: 0 };
  }

  if (paidUsd >= totalUsd) {
    return {
      changeUsd: Math.round((paidUsd - totalUsd) * 100) / 100,
      changeLbp: Math.round(paidLbp),
      changeEquivalent,
    };
  }

  const lbpNeededForRemainder = Math.max(0, totalLbp - Math.round(paidUsd * rate));
  const changeLbp = Math.max(0, Math.round(paidLbp - lbpNeededForRemainder));

  return {
    changeUsd: 0,
    changeLbp,
    changeEquivalent,
  };
}
