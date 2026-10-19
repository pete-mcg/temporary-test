import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ModeSelector from '../src/components/ModeSelector/ModeSelector';
import userEvent from '@testing-library/user-event';
import { Mode } from '../src/api';
import React from 'react';

describe('ModeSelector', () => {
    it('can select related response mode', async () => {
        const mockModeSelected = vi.fn();

        const { getByTestId } = render(<ModeSelector onModeSelected={mockModeSelected} />);

        const button = getByTestId(Mode.relatedResponses);

        await userEvent.click(button);

        expect(mockModeSelected).toHaveBeenCalledWith(Mode.relatedResponses);
    });

    it('can select evaluate draft mode', async () => {
        const mockModeSelected = vi.fn();

        const { getByTestId } = render(<ModeSelector onModeSelected={mockModeSelected} />);

        const button = getByTestId(Mode.evaluateDraft);

        await userEvent.click(button);

        expect(mockModeSelected).toHaveBeenCalledWith(Mode.evaluateDraft);
    });

    it('can select policy and guidance mode', async () => {
        const mockModeSelected = vi.fn();

        const { getByTestId } = render(<ModeSelector onModeSelected={mockModeSelected} />);

        const button = getByTestId(Mode.policyAndGuidance);

        await userEvent.click(button);

        expect(mockModeSelected).toHaveBeenCalledWith(Mode.policyAndGuidance);
    });

    it('can select ask anything mode', async () => {
        const mockModeSelected = vi.fn();

        const { getByTestId } = render(<ModeSelector onModeSelected={mockModeSelected} />);

        const button = getByTestId(Mode.askAnything);

        await userEvent.click(button);

        expect(mockModeSelected).toHaveBeenCalledWith(Mode.askAnything);
    });
});
