import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@frontend/src/components/ui/button'
import { Input } from '@frontend/src/components/ui/input'
import styles from './admin-panel.module.css'

const credentials = z.object({
  email: z.string().trim().max(254, 'Проверьте адрес электронной почты.').pipe(z.email('Введите корректный email.')),
  password: z.string().min(8, 'Минимум 8 символов.').max(72, 'Максимум 72 символа.'),
})

type Credentials = z.infer<typeof credentials>

interface LoginFormProps {
  signIn: (values: Credentials) => Promise<string | undefined>
  message?: string
}

export function LoginForm({ signIn, message }: LoginFormProps) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Credentials>({
    resolver: zodResolver(credentials),
    defaultValues: { email: '', password: '' },
  })
  const submit = handleSubmit(async values => {
    const error = await signIn(values)
    if (error) setError('root', { message: error })
  })
  const notice = errors.root?.message ?? message

  return (
    <>
      <h1>Вход в админ-панель</h1>
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label htmlFor="admin-email">Email</label>
          <Input id="admin-email" type="email" autoComplete="username" aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'admin-email-error' : undefined} {...register('email')} />
          {errors.email && <span id="admin-email-error" className={styles.error}>{errors.email.message}</span>}
        </div>
        <div className={styles.field}>
          <label htmlFor="admin-password">Пароль</label>
          <Input id="admin-password" type="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'admin-password-error' : undefined} {...register('password')} />
          {errors.password && <span id="admin-password-error" className={styles.error}>{errors.password.message}</span>}
        </div>
        {notice && <p className={styles.error} role="alert">{notice}</p>}
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Входим…' : 'Войти'}</Button>
      </form>
    </>
  )
}
