package it.aicof.desk.security.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.jetbrains.annotations.NotNull;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.*;

@RequiredArgsConstructor
public class DeskJwtValidationFilter extends OncePerRequestFilter {

    private final Set<String> exclusions;
    private final AntPathMatcher matcher;
    private final JwtDecoder deskJwtDecoder;

    @Override
    protected boolean shouldNotFilter(@NotNull HttpServletRequest request) {
        String path = request.getServletPath();
        return exclusions.stream().anyMatch(p -> matcher.match(p, path)) || "OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(@NotNull HttpServletRequest request, @NotNull HttpServletResponse response, @NotNull FilterChain filterChain) throws IOException, ServletException {
        String header = request.getHeader("Authorization");

        if (bearerIsMissing(header)) {
            unauthorize(response, "Bearer Token is missing");
            return;
        }

        try {
            String token = header.substring(7);
            Jwt jwt = deskJwtDecoder.decode(token);

            Collection<SimpleGrantedAuthority> authorities = new ArrayList<>();

            List<Map<String, Object>> rolesList = jwt.getClaim("roles");
            if (rolesList != null && !rolesList.isEmpty()) {
                for (Map<String, Object> roleMap : rolesList) {
                    String roleCode = (String) roleMap.get("idRuolo");
                    if (roleCode != null && !roleCode.isEmpty()) {
                        if (!roleCode.startsWith("ROLE_")) {
                            authorities.add(new SimpleGrantedAuthority("ROLE_" + roleCode.toUpperCase()));
                        } else {
                            authorities.add(new SimpleGrantedAuthority(roleCode.toUpperCase()));
                        }
                    }
                }
            } else {
                authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
            }

            JwtAuthenticationToken auth = new JwtAuthenticationToken(jwt, authorities);

            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(auth);
            SecurityContextHolder.setContext(context);

            filterChain.doFilter(request, response);
        } catch (Exception e) {
            unauthorize(response, "Desk jwt non valido: " + e.getMessage());
        }
    }

    private void unauthorize(HttpServletResponse response, String msg) throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + msg + "\"}");
    }

    private boolean bearerIsMissing(String header) {
        return (header == null || !header.startsWith("Bearer ") || header.length() == 7);
    }

}