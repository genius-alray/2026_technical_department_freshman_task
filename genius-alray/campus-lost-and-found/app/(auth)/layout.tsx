export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col justify-center px-6 py-12">
      {children}
    </div>
  )
}
