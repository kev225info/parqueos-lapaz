import nodemailer from 'nodemailer';

// Configuración para desarrollo (Ethereal Email - servicio gratuito de pruebas)
// En producción, reemplazar con SMTP real (Gmail, SendGrid, etc.)
const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || 'tu_usuario@ethereal.email',
        pass: process.env.EMAIL_PASS || 'tu_password_ethereal'
    }
});

// Función para enviar correo de restablecimiento
export const enviarCorreoRestablecimiento = async (email, token) => {
    const enlace = `https://tu-app.com/reset-password?token=${token}`;
    
    const mailOptions = {
        from: '"Parqueos La Paz" <no-reply@parqueoslapaz.com>',
        to: email,
        subject: 'Restablecimiento de Contraseña - Parqueos La Paz',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1976d2;">Restablecimiento de Contraseña</h2>
                <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>Parqueos La Paz</strong>.</p>
                <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
                <a href="${enlace}" style="display: inline-block; background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
                    Restablecer Contraseña
                </a>
                <p><strong>Importante:</strong></p>
                <ul>
                    <li>Este enlace es válido por <strong>30 minutos</strong>.</li>
                    <li>Solo puede usarse una vez.</li>
                    <li>Si no solicitaste este cambio, ignora este correo.</li>
                </ul>
                <p>Token (solo para pruebas): <code>${token}</code></p>
                <hr>
                <p style="color: #666; font-size: 12px;">Este es un correo automático, por favor no responder.</p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Correo enviado:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error al enviar correo:', error);
        return { success: false, error: error.message };
    }
};