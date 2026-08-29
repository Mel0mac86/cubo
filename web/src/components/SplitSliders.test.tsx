import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitSliders } from './SplitSliders';
import { JAR_INFO } from '../lib/format';

describe('Slider dei tre salvadanai', () => {
  it('mostra gli importi corrispondenti alle percentuali', () => {
    render(<SplitSliders split={{ save: 60, spend: 30, give: 10 }} onChange={() => {}} totaleCents={1000} minGive={10} />);
    expect(screen.getByText('€ 6,00')).toBeInTheDocument();
    expect(screen.getByText('€ 3,00')).toBeInTheDocument();
    expect(screen.getByText('€ 1,00')).toBeInTheDocument();
    expect(screen.getByText(/Totale 100%/)).toBeInTheDocument();
  });

  it('quando si muove uno slider il totale resta 100%', () => {
    const onChange = vi.fn();
    render(<SplitSliders split={{ save: 60, spend: 30, give: 10 }} onChange={onChange} totaleCents={1000} minGive={10} />);
    fireEvent.change(screen.getByLabelText(`Percentuale ${JAR_INFO.SAVE.nome}`), { target: { value: '80' } });
    const nuovo = onChange.mock.calls[0][0];
    expect(nuovo.save).toBe(80);
    expect(nuovo.save + nuovo.spend + nuovo.give).toBe(100);
    expect(nuovo.give).toBeGreaterThanOrEqual(10);
  });

  it('lo slider del dono non può scendere sotto il minimo', () => {
    render(<SplitSliders split={{ save: 60, spend: 30, give: 10 }} onChange={() => {}} totaleCents={1000} minGive={10} />);
    expect(screen.getByLabelText(`Percentuale ${JAR_INFO.GIVE.nome}`)).toHaveAttribute('min', '10');
    expect(screen.getByText(new RegExp(`${JAR_INFO.GIVE.nome} almeno 10%`))).toBeInTheDocument();
  });

  it('segnala quando il totale non fa 100', () => {
    render(<SplitSliders split={{ save: 50, spend: 30, give: 10 }} onChange={() => {}} totaleCents={1000} minGive={10} />);
    expect(screen.getByText(/deve fare 100%/)).toBeInTheDocument();
  });
});
