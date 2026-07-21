export const validateEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

export const validateUsername = (username: string): boolean => {
  // 1. Minimum length of 4
  if (username.length < 4) return false;

  // 2. Starts with a letter: ^[A-Za-z]
  // 3. No consecutive underscores: (?!.*__)
  // 4. Allowed characters + no trailing underscore: [A-Za-z0-9_]*[A-Za-z0-9]$
  const regex = /^[A-Za-z](?!.*__)[A-Za-z0-9_]*[A-Za-z0-9]$/;
  
  return regex.test(username);
};



export const validatePassword = (password: string): boolean => {
  const regex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(password);
};
