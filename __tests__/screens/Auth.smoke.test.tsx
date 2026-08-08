import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { AccessibilityProvider } from '../../lib/AccessibilityContext';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
    from: jest.fn().mockReturnThis(),
    upsert: jest.fn(),
  },
}));

import Auth from '../../screens/Auth';

describe('Auth screen smoke test', () => {
  beforeAll(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
  });

  it('renders the sign-in form with labeled inputs and a labeled submit button', async () => {
    const { getByLabelText } = render(
      <AccessibilityProvider>
        <Auth />
      </AccessibilityProvider>
    );

    await waitFor(() => getByLabelText('Email address'));
    expect(getByLabelText('Email address')).toBeTruthy();
    expect(getByLabelText('Password')).toBeTruthy();
    expect(getByLabelText('Sign In')).toBeTruthy();
  });

  it('switches to sign-up mode and shows the First Name field, still labeled', async () => {
    const { getByLabelText } = render(
      <AccessibilityProvider>
        <Auth />
      </AccessibilityProvider>
    );

    await waitFor(() => getByLabelText('Email address'));
    fireEvent.press(getByLabelText("Don't have an account? Sign Up"));

    await waitFor(() => getByLabelText('First name'));
    expect(getByLabelText('First name')).toBeTruthy();
    expect(getByLabelText('Create Account')).toBeTruthy();
  });
});
