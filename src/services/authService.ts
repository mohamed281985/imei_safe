import { supabase } from '../lib/supabase';

interface SignUpOptions {
  username: string;
  phoneNumber?: string;
}

/**
 * Signs up a new user with email and password.
 * It also checks if the email already exists.
 *
 * @param email The user's email.
 * @param password The user's password.
 * @param options Additional user data like username and phone number.
 * @returns A promise that resolves to 'success', 'email_exists', or 'error'.
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  options: SignUpOptions
): Promise<'success' | 'email_exists' | 'error'> => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: options.username,
          phone_number: options.phoneNumber,
        }
      }
    });

    if (error) {
      if (error.message.includes('User already registered')) {
        return 'email_exists';
      }
      throw error;
    }

    // التحقق من نجاح التسجيل
    if (!data.user || !data.user.identities || data.user.identities.length === 0) {
      return 'email_exists';
    }

    return 'success';
  } catch (error) {
    console.debug('Error in signUpWithEmail:', error);
    return 'error';
  }
}