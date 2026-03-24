export interface InstallmentPreview {
  number: number;
  amount: number;
  dueDate: string;
  dayAdjusted?: boolean;
  originalDay?: number;
}

export const generateInstallmentsPreview = (
  amount: number,
  installmentCount: number,
  amountMode: 'total' | 'parcela',
  dueDateStr: string,
  installmentFixedDay: boolean,
  installmentDaysInterval: number
): InstallmentPreview[] => {
  if (!amount || installmentCount < 2) return [];

  let perInstallment: number;
  let remainder = 0;

  if (amountMode === 'total') {
    perInstallment = Math.floor((amount / installmentCount) * 100) / 100;
    remainder = Math.round((amount - perInstallment * installmentCount) * 100) / 100;
  } else {
    perInstallment = amount;
  }

  const previews: InstallmentPreview[] = [];
  const startDate = new Date(dueDateStr + 'T12:00:00');

  for (let i = 0; i < installmentCount; i++) {
    let dueDate: Date;
    if (installmentFixedDay) {
      const targetDay = startDate.getDate();
      const baseMonth = startDate.getMonth() + i;
      const targetYear = startDate.getFullYear() + Math.floor(baseMonth / 12);
      const actualMonth = ((baseMonth % 12) + 12) % 12;
      const maxDay = new Date(targetYear, actualMonth + 1, 0).getDate();
      dueDate = new Date(targetYear, actualMonth, Math.min(targetDay, maxDay), 12, 0, 0);
    } else {
      dueDate = new Date(startDate);
      dueDate.setDate(startDate.getDate() + i * installmentDaysInterval);
    }
    const dayWasAdjusted = installmentFixedDay && i > 0 && dueDate.getDate() !== startDate.getDate();
    const [y, m, d] = [dueDate.getFullYear(), String(dueDate.getMonth() + 1).padStart(2, '0'), String(dueDate.getDate()).padStart(2, '0')];
    
    previews.push({
      number: i + 1,
      amount: (amountMode === 'total' && i === 0) ? perInstallment + remainder : perInstallment,
      dueDate: `${y}-${m}-${d}`,
      dayAdjusted: dayWasAdjusted,
      originalDay: dayWasAdjusted ? startDate.getDate() : undefined,
    });
  }
  
  return previews;
};
